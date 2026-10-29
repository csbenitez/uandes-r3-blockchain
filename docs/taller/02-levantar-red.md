# 02 · Levantar la red y explorarla

```powershell
.\taller.ps1 up
.\taller.ps1 status
```
Qué ocurre: el servicio efímero `besu-init` ejecuta `besu operator generate-blockchain-config` (ver `network/init/generate.sh`) y escribe en `network/out/`: `genesis.json`, las llaves de cada validador (`node1..4/key`) y el `bootnode` (enode del node1). Luego `node1..4` arrancan con `network/init/start.sh`, IPs fijas `172.16.239.11-14` y descubrimiento por el bootnode.

> Los primeros ~15 s el RPC responde `0x0`: la red aún negocia el primer bloque.

## JSON-RPC: tu "REST" de la cadena
```bash
rpc(){ curl -s -X POST -H 'content-type: application/json' --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}" localhost:${3:-8545}; echo; }
rpc eth_blockNumber '[]'                       # altura (hex)
rpc net_peerCount '[]'                         # 0x3: ve a los otros 3
rpc eth_chainId '[]'                           # 0x4f25 = 20261
rpc qbft_getValidatorsByBlockNumber '["latest"]'   # los 4 validadores
rpc eth_getBlockByNumber '["latest", false]'       # un bloque completo
rpc eth_getBalance '["0xfe3b557e8fb62b89f4916b721be55ceb828dbd73","latest"]'
rpc admin_peers '[]'                           # detalle de pares
```
Ejercicios:
1. Compara `eth_blockNumber` en 8545 y 8575: deben coincidir (ledger replicado).
2. Mira `extraData` de un bloque: contiene validadores y los **sellos de commit** (las firmas del quórum).
3. Revisa `network/out/node1/key` y `key.pub`: la identidad del nodo es un par de claves; la **dirección del validador** sale de la pública.

## Archivos clave
- `network/config.toml`: APIs habilitadas, CORS (abierto, solo para el taller), métricas en `:9545`.
- El genesis prefinancia 3 cuentas de desarrollo.
