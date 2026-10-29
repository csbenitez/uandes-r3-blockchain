# 07 · Microservicio Go: indexador de eventos

Código: `services/cmd/indexer/main.go`, `services/internal/store`. Levanta con `.\taller.ps1 up -Tools` (espera `deployments/besu.json`: ejecuta antes `deploy`).

## Por qué existe
Leer la cadena directamente es lento para consultas ("todos los eventos de X"). Patrón estándar: **indexar** los logs en una BD normal (SQLite) y exponerlos por REST. La fuente de verdad sigue siendo la cadena; el índice se puede reconstruir.

## Cómo funciona
1. Espera y lee `besu.json` (dirección, ABI, bloque de despliegue).
2. **Backfill**: `FilterLogs` desde el último bloque guardado hasta hoy.
3. **Suscripción WebSocket** (`SubscribeFilterLogs`) a nuevos logs.
4. Decodifica `EventRegistered` con el ABI y hace `INSERT OR IGNORE` por `(txHash, logIndex)` → **idempotente**: reconexiones y reprocesos no duplican.
5. Si el WS cae, reintenta rotando `node1 → node2` (**failover**).

Finalidad: en QBFT no hay reorganizaciones, así que no hace falta esperar confirmaciones. En Ethereum público/PoW sí (esperar N bloques y manejar *reorgs*).

## API
| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/events` | últimos 200 |
| GET | `/events/{docHash}` | eventos de un hash |
| GET | `/health` | bloque de la cadena, último indexado, peers, nodo WS activo |
| POST | `/register` | `{keyId, content|docHash, kind, uri}` → firma con KMS y envía |

```bash
curl localhost:8081/health
curl -X POST localhost:8081/register -H 'content-type: application/json' \
  -d '{"keyId":"fe3b557e8fb62b89","content":"mi-factura-1","kind":"FACTURA"}'
curl localhost:8081/events
```
(`keyId` sale de `POST localhost:7070/keys/import`, ver guía 03.)

## Cosas para discutir
- El `nonce` se pide con `PendingNonceAt`: con alta concurrencia hace falta una cola de nonces por cuenta.
- El `/register` es un ejemplo; en producción autentica al llamante y limita las llaves que puede usar.
- Para ABI tipado se puede usar `abigen`; aquí se usa `abi.JSON` dinámico para que el servicio siga cualquier redespliegue.
- `go test ./...` en `services/` prueba firma/recuperación, cifrado y firma de tx del KMS.
