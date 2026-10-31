# Consumo por roles

Catálogo de lo que dejó E1 para que otros roles lo usen sin leer el código.

## Qué usa cada rol

| Rol | Usa | No necesita |
|---|---|---|
| 2 | Perfil `monitoring`, trabajos de Prometheus | Resultados de E1 |
| 3 | Generador, huella, interfaz del contrato, reintentos idempotentes | Correr E1 |
| 4 | Interfaz y pruebas de conformidad | Correr E1 |
| 5 | Interfaz y `Item`; huellas aleatorias bastan | Generador y resultados de E1 |
| 6 | `resumen.json`, `resultados.csv`, tablero de Grafana | Código |

## Contrato: `IRegistroFacturas`

Archivo: [IRegistroFacturas.sol](../../contracts-hardhat/contracts/IRegistroFacturas.sol). Implementación actual: `RegistroFacturasMinimo`.

**`Item`**

| Campo | Tipo | Contenido |
|---|---|---|
| `facturaId` | `bytes32` | SHA-256 del identificador de negocio |
| `huella` | `bytes32` | SHA-256 del JSON canónico |
| `cuenta` | `bytes32` | HMAC-SHA256 del NIC con sal off-chain |
| `periodo` | `uint32` | Formato `AAAAMM` |
| `wh` | `uint96` | Total de energía en Wh |
| `cop` | `uint96` | Total en COP |

**Funciones**

| Función | Quién | Efecto |
|---|---|---|
| `registrarLote(Item[])` | Solo `registrador` | Ancla de 1 a 100 facturas |
| `huellaDe(bytes32)` | Cualquiera | Huella vigente; `bytes32(0)` si no está anclada |

**Evento**

`FacturaAnclada(bytes32 indexed facturaId, bytes32 huella, bytes32 cuenta, uint32 periodo, uint96 wh, uint96 cop)`

**Errores**

| Error | Cuándo |
|---|---|
| `NoAutorizado(cuenta)` | Quien escribe no es el registrador |
| `LoteInvalido(tamano)` | Lote vacío o mayor a 100 |
| `ItemInvalido(facturaId)` | Identificador o huella vacíos |
| `HuellaDistinta(facturaId)` | La factura ya existe con otra huella |

**Reintentos:** reenviar una factura con la misma huella se omite sin error y sin evento, así que un lote reintentado no falla. Un conflicto revierte el lote completo.

**Dirección y ABI:** las escribe `deploy-e1.js` en `deployments/e1.json`, que no se versiona porque cambia en cada corrida.

```json
{ "chainId": 20261, "deployer": "0x…", "deployBlock": 0,
  "RegistroFacturas": { "contrato": "RegistroFacturasMinimo", "address": "0x…", "abi": [] } }
```

## Servicio: `invoice-verifier`

Corre con el perfil `e1` en el puerto 8090. Solo lee: no firma ni escribe en la cadena. Consulta el nodo 3, no el de Voltera.

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/facturas/{idNegocio}/verificacion` | Resultado y evidencia |
| GET | `/health` | Contrato y bloque actual |
| GET | `/metrics` | Métricas de Prometheus |

```json
{ "idNegocio": "FAC-2026-10-0000001", "resultado": "ÍNTEGRA", "motivo": "coincide",
  "evidencia": { "facturaId": "0x…", "hashCalculado": "0x…", "hashCadena": "0x…", "txHash": "0x…" } }
```

| `resultado` | `motivo` |
|---|---|
| `ÍNTEGRA` | `coincide` |
| `NO ANCLADA` | `sin_registro_en_cadena` |
| `ALTERADA` | `huella_distinta`, `json_no_canonicalizable`, `documento_ausente`, `cifrado_invalido`, `pdf_distinto`, `pdf_documento_ausente`, `pdf_cifrado_invalido` |

Responde `400` si el identificador no es válido y `503` si la cadena no responde. Sin cadena no hay veredicto, y eso no se reporta como `ALTERADA`.

| Variable | Uso |
|---|---|
| `RPC_HTTP_URL` | Nodo que se consulta |
| `DEPLOYMENT_FILE` | Ruta de `e1.json` |
| `DATOS_DIR` | Carpeta de documentos cifrados |
| `LLAVE_DOCUMENTOS_HEX` | Llave AES-256 en hexadecimal |

**Para conectar `settlement-ledger`:** implementar `verificacion.ConsultaAnclaje` (`HuellaDe` y `TxDe`) en [verificacion.go](../../services/internal/verificacion/verificacion.go). La lógica del verificador no cambia.

## Eventos

E1 solo emite `FacturaAnclada` en la cadena. **No publica eventos en NATS:** `FacturaEmitida`, `LiquidacionAnclada` y los demás de la lámina 19 quedan para `billing-engine` y `settlement-ledger`.

## Métricas

**`invoice-verifier`**

| Métrica | Tipo |
|---|---|
| `invoice_verifier_verificaciones_total{resultado,motivo}` | Contador |
| `invoice_verifier_fallas_cadena_total` | Contador |
| `invoice_verifier_duracion_ms` | Histograma |

**Conductor del experimento** (puerto 9464, solo mientras corre)

| Métrica | Contenido |
|---|---|
| `e1_fase` | Fase de 1 a 5 |
| `e1_facturas_ancladas` | Avance del anclaje |
| `e1_alteraciones_aplicadas` | Avance de la fase 3 |
| `e1_detectadas` | Alteraciones detectadas |
| `e1_falsos_positivos` | Íntegras mal clasificadas |
| `e1_no_ancladas_correctas` | Casos sin anclar correctos |
| `e1_control_sin_canonica_falsos_positivos` | Control negativo |
| `e1_criterio_cumplido` | -1 en curso, 0 no cumple, 1 cumple |
| `e1_verificadas_total{caso,obtenido}` | Matriz esperado contra obtenido |
| `e1_objetivo{grupo}` | Objetivos de la corrida |

Tablero: `http://localhost:3001/d/e1-integridad`. Para agregar otro, deja el JSON en `monitoring/grafana/tableros/`.

## Consultas de Prometheus útiles

```promql
sum by (resultado) (invoice_verifier_verificaciones_total)
sum by (motivo) (invoice_verifier_verificaciones_total{resultado="ALTERADA"})
histogram_quantile(0.95, sum by (le) (rate(invoice_verifier_duracion_ms_bucket[1m])))
last_over_time(e1_criterio_cumplido[2h])
```

## Comandos

Se ejecutan desde la raíz: `bash experimentos/e1-integridad/e1.sh <comando>`.

| Comando | Acción |
|---|---|
| `todo` | Limpia, prueba, levanta y corre todo |
| `pruebas` | Pruebas de Node, Python, Solidity y Go |
| `red` | Levanta nodos, Prometheus y Grafana |
| `desplegar` | Despliega el contrato y levanta el servicio |
| `correr` | Contrato nuevo y las 5 fases |
| `rapido` | Igual, con 485 facturas |
| `reporte` | Reimprime el último resultado |
| `consultar <id>` | Verifica una factura; acepta `integra`, `alterada`, `pdf` o `sin_anclar` |
| `estado` | Muestra nodos, servicio y direcciones |
| `limpiar` | Borra contenedores, cadena y datos |

## Generador de facturas (Node)

```js
const { crearRng, generarFactura } = require("./experimentos/e1-integridad/src/generador");
const rng = crearRng("semilla");
const { idNegocio, factura, texto, pdf, item } = generarFactura(rng, 1, "sal");
// item se pasa directo a registrarLote; texto es el JSON emitido.
```

Misma semilla, mismas facturas. Las facturas son sintéticas.

## Huella por lenguaje

| Lenguaje | Código | Uso |
|---|---|---|
| Node | `experimentos/e1-integridad/src/huella.js` | `huellaDeFactura(texto)` |
| Go | `services/internal/huella` | `huella.HuellaDeFactura(texto)` |
| Python | `experimentos/e1-integridad/vectores/verificar.py` | Solo comprobación |

Una implementación nueva debe pasar `vectores/vectores.json`.

## Evidencias de E1

| Archivo | Contenido |
|---|---|
| `resultados/besu/resumen.json` | Criterios, controles, gas, latencia y configuración |
| `resultados/besu/historial/` | Una fila por verificación |
| `resultados/besu/historial/` | Log, resumen y CSV generados por las corridas |

**Columnas del CSV:** `idNegocio`, `facturaId`, `caso`, `tipo`, `esperado`, `obtenido`, `motivo`, `hashCalculado`, `hashCadena`, `txHash`, `txCoincide`, `ms`, `correcto`.

Esta estructura es una decisión de E1: `hashCalculado`, `hashCadena` y `txHash` vienen de la Evidencia de la lámina 16, y el resto permite auditar la lámina 23.
