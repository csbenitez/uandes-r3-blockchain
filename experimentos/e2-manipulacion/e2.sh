#!/usr/bin/env bash
# Operación de E2 en WSL, Git Bash o Linux. Uso: bash experimentos/e2-manipulacion/e2.sh <comando>
#   red          levanta los 4 nodos, Prometheus y Grafana
#   desplegar    despliega el contrato de facturas (deployments/e1.json)
#   guiado       terminal guiada: menú, paso a paso y acciones manuales
#   autopiloto   secuencia completa con pausas (PAUSA=8 segundos por defecto)
#   correr       conductor automático sin interfaz (resultados/resumen.json)
#   pruebas      pruebas de Node
#   estado       altura y hash de cada nodo
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"
E2="experimentos/e2-manipulacion"

titulo() { printf '\n\033[1;35m==> %s\033[0m\n' "$1"; }

case "${1:-}" in
  red)
    titulo "Red QBFT de 4 validadores, Prometheus y Grafana"
    docker compose --profile monitoring up -d node1 node2 node3 node4 prometheus grafana
    echo "Grafana: http://localhost:3001  (tablero 'E2 · Manipulación del libro')"
    ;;
  desplegar)
    titulo "Despliegue del contrato de facturas"
    (cd contracts-hardhat && npx hardhat run scripts/deploy-e1.js --network besu)
    ;;
  guiado) node "$E2/guiado.js" ;;
  autopiloto) node "$E2/guiado.js" --autopiloto --pausa="${PAUSA:-8}" ;;
  correr) node "$E2/correr.js" "${@:2}" ;;
  pruebas) node --test --test-reporter=spec "$E2"/test/*.test.js ;;
  estado) timeout 60 node "$E2/src/observador.js" | head -3 ;;
  *) sed -n '2,10p' "${BASH_SOURCE[0]}" ;;
esac
