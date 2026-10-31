#!/usr/bin/env bash
# Operación de E1 en WSL o Linux. Uso: bash experimentos/e1-integridad/e1.sh <comando>
#   todo        limpia, prueba, levanta y corre el experimento completo
#   pruebas     pruebas de Node, Python, Solidity y Go
#   red         levanta los 4 nodos, Prometheus y Grafana
#   desplegar   despliega el contrato y levanta invoice-verifier
#   correr      despliega un contrato nuevo y ejecuta las fases (exige la red arriba)
#   rapido      como correr, con 485 facturas
#   reporte     vuelve a imprimir el último resultado
#   consultar   verifica una factura: consultar <idNegocio|integra|alterada|pdf|sin_anclar>
#   estado      nodos, servicio y direcciones
#   limpiar     borra contenedores, cadena y datos del experimento
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"
E1="experimentos/e1-integridad"
PUERTOS_RPC=(8545 8555 8565 8575)
ARCHIVO_LLAVE="$E1/.datos/.llave"

titulo() { printf '\n\033[1;35m==> %s\033[0m\n' "$1"; }
falla() { printf '\033[1;31m%s\033[0m\n' "$1" >&2; exit 1; }

rpc() {
  curl -s -m 3 -X POST "http://localhost:$1" -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$2\",\"params\":[]}" |
    sed -n 's/.*"result":"\(0x[0-9a-f]*\)".*/\1/p'
}

requisitos() {
  for cmd in docker node npm python3 go curl openssl; do
    command -v "$cmd" >/dev/null || falla "Falta $cmd; ver docs/voltera/e1-integridad.md"
  done
  docker compose version >/dev/null 2>&1 || falla "Falta el plugin docker compose"
  [ -d node_modules ] || npm ci --no-audit --no-fund
}

pruebas() {
  requisitos
  titulo "Vectores y lógica de Node"
  node --test --test-reporter=spec "$E1"/test/*.test.js 2>&1 | tail -9
  titulo "Reimplementación independiente en Python"
  python3 "$E1/vectores/verificar.py"
  titulo "Contratos: conformidad de IRegistroFacturas"
  (cd contracts-hardhat && npx hardhat test test/RegistroFacturas.conformidad.test.js)
  titulo "Go: huella, almacén y verificación"
  (cd services && go test ./internal/huella ./internal/almacen ./internal/verificacion)
}

llave() {
  mkdir -p "$E1/.datos"
  [ -f "$ARCHIVO_LLAVE" ] || openssl rand -hex 32 > "$ARCHIVO_LLAVE"
  LLAVE_DOCUMENTOS_HEX="$(cat "$ARCHIVO_LLAVE")"
  export LLAVE_DOCUMENTOS_HEX
}

red() {
  requisitos
  llave
  titulo "Red QBFT de 4 validadores, Prometheus y Grafana"
  docker compose --profile monitoring up -d node1 node2 node3 node4 prometheus grafana
  printf 'Esperando bloques y 3 pares en cada nodo'
  for _ in $(seq 1 60); do
    listos=0
    for p in "${PUERTOS_RPC[@]}"; do
      bloque="$(rpc "$p" eth_blockNumber || true)"
      pares="$(rpc "$p" net_peerCount || true)"
      if [ -n "$bloque" ] && [ -n "$pares" ] && [ $((bloque)) -gt 1 ] && [ $((pares)) -ge 3 ]; then
        listos=$((listos + 1))
      fi
    done
    [ "$listos" -eq 4 ] && { printf ' listo\n'; return; }
    printf '.'
    sleep 3
  done
  falla "La red no quedó lista; revisa: docker compose logs node1"
}

desplegar() {
  requisitos
  llave
  titulo "Despliegue del contrato"
  (cd contracts-hardhat && npx hardhat run scripts/deploy-e1.js --network besu)
  titulo "invoice-verifier, leyendo la copia del nodo 3"
  docker compose --profile e1 up -d --build --force-recreate invoice-verifier
  for _ in $(seq 1 30); do
    curl -sf -m 2 http://localhost:8090/health >/dev/null && { curl -s http://localhost:8090/health; return; }
    sleep 1
  done
  falla "invoice-verifier no respondió; revisa: docker compose logs invoice-verifier"
}

correr() {
  # Contrato nuevo en cada corrida: uno usado rechaza, con razón, otra huella para la misma factura.
  desplegar
  rm -f "$E1"/.datos/*.enc
  local log rc=0
  log="$(mktemp)"
  (cd contracts-hardhat && npx hardhat run ../"$E1"/correr.js --network besu) 2>&1 | tee "$log" || rc=$?
  archivar "$rc" "$log"
  rm -f "$log"
  return "$rc"
}

# Cada corrida deja su traza: el resumen y el log siempre; el CSV solo con E1_OFICIAL=1.
archivar() {
  local rc="$1" log="$2" base="$E1/resultados/besu" nombre destino
  if [ "$rc" -eq 0 ]; then
    nombre="$(node -e "
      const r = require('./$base/resumen.json');
      const fecha = r.fecha.replace(/[-:]/g, '').replace(/\.\d+Z/, 'Z');
      const n = r.configuracion.integras + r.configuracion.alteradas + r.configuracion.sinAnclar + r.configuracion.limite;
      console.log([fecha, r.codigo.replace('+', '-'), 'c' + r.configuracion.concurrencia, 'n' + n].join('_'));")"
  else
    nombre="$(date -u +%Y%m%dT%H%M%SZ)_$(git rev-parse --short HEAD)_fallida"
  fi
  destino="$base/historial/$nombre"
  mkdir -p "$destino"
  sed 's/\x1b\[[0-9;]*m//g' "$log" > "$destino/ejecucion.log"
  if [ "$rc" -eq 0 ]; then
    cp "$base/resumen.json" "$destino/"
    [ "${E1_OFICIAL:-0}" = "1" ] && cp "$base/resultados.csv" "$destino/"
  fi
  echo "Traza guardada en $destino"
}

consultar() {
  local id="${1:-}"
  case "$id" in
    integra) id="$(ejemplo integra)" ;;
    alterada) id="$(ejemplo alterada1Cop)" ;;
    pdf) id="$(ejemplo alteradaPdf)" ;;
    sin_anclar) id="$(ejemplo sinAnclar)" ;;
    "") falla "Uso: consultar <idNegocio|integra|alterada|pdf|sin_anclar>" ;;
  esac
  curl -s "http://localhost:8090/facturas/$id/verificacion" | python3 -m json.tool --no-ensure-ascii
}

ejemplo() {
  node -e "console.log(require('./$E1/resultados/besu/resumen.json').ejemplos['$1'])"
}

estado() {
  docker compose --profile monitoring --profile e1 ps --format 'table {{.Name}}\t{{.Status}}'
  for p in "${PUERTOS_RPC[@]}"; do
    bloque="$(rpc "$p" eth_blockNumber || true)"
    printf 'puerto %s: bloque %d\n' "$p" "$((${bloque:-0}))"
  done
  curl -s -m 2 http://localhost:8090/health || echo "invoice-verifier abajo"
  echo
  echo "Grafana:    http://localhost:3001/d/e1-integridad"
  echo "Prometheus: http://localhost:9090"
}

limpiar() {
  titulo "Limpieza de contenedores, cadena y datos"
  docker compose --profile tools --profile monitoring --profile e1 down -v --remove-orphans
  source .env
  docker run --rm -v "$RAIZ/network:/n" --entrypoint /bin/rm "$BESU_IMAGE" -rf /n/out
  rm -rf "$E1/.datos" deployments/e1.json
}

comando="${1:-}"
[ $# -gt 0 ] && shift
case "$comando" in
  todo) limpiar; pruebas; red; correr ;;
  pruebas) pruebas ;;
  red) red ;;
  desplegar) desplegar ;;
  correr) correr ;;
  rapido) E1_INTEGRAS=300 E1_ALTERADAS=160 E1_SIN_ANCLAR=20 E1_LIMITE=5 correr ;;
  reporte) node "$E1/src/reporte.js" "$E1/resultados/besu/resumen.json" ;;
  consultar) consultar "${1:-}" ;;
  estado) estado ;;
  limpiar) limpiar ;;
  *) sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \?//' ;;
esac
