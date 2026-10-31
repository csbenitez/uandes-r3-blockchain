# 09 · Laboratorios

## A. Tolerancia a fallos (probado en este repo)
```powershell
.\taller.ps1 status
docker stop node4;  .\taller.ps1 status     # sigue: 3 de 4 = quórum
docker stop node3;  .\taller.ps1 status     # se detiene: bloque congelado (2 < 3)
docker start node3 node4                    # se recupera; puede tardar ~3 min (backoff de rondas)
```
Resultado observado: con 1 nodo caído el bloque avanzó (169→172); con 2 caídos se congeló en 173 y recuperó tras unos minutos. Los logs `RoundChangeManager` muestran las rondas subiendo hasta sincronizarse. **Lección**: disponibilidad vs. seguridad; QBFT prefiere parar a bifurcarse.

## B. Agregar/quitar validadores (gobernanza on-chain)
Los validadores votan con la API QBFT; hace falta mayoría de los actuales.
```bash
# en CADA validador existente (mayoría) proponer añadir una dirección:
curl -X POST localhost:8545 -H 'content-type: application/json' \
 --data '{"jsonrpc":"2.0","id":1,"method":"qbft_proposeValidatorVote","params":["0xNUEVA_DIRECCION", true]}'
curl -X POST localhost:8545 --data '{"jsonrpc":"2.0","id":1,"method":"qbft_getValidatorsByBlockNumber","params":["latest"]}' -H 'content-type: application/json'
```
Repite con `false` para expulsar. Mantén `n ≥ 4`. Variante avanzada: contrato de selección de validadores (*validator smart contract*).

## C. Permisos (consorcio de verdad)
Besu permite **allowlists** de nodos y cuentas (`--permissions-nodes-config-file-enabled`, `--permissions-accounts-config-file-enabled`, o permisos on-chain con contrato). Ejercicio: habilita la lista de cuentas y verifica que una cuenta no listada no puede enviar tx.

## D. Cambiar de consenso
`.\taller.ps1 reset; .\taller.ps1 up -Consensus ibft2` y repite el laboratorio A. Compara tiempos de recuperación y los métodos `ibft_*`.

## E. Observabilidad
`.\taller.ps1 up -Monitoring` → Grafana http://localhost:3001 (el datasource Prometheus ya viene configurado) → importa el dashboard "Besu Full" (ID 10273). Observa `ethereum_blockchain_height`, peers y `besu_transaction_pool_transactions`.

## F. Ataques de integridad (¡divertido!)
1. Registra un hash; cambia 1 byte del archivo y verifica → no existe.
2. Intenta registrar el mismo hash → `AlreadyRegistered`.
3. Intenta registrar con una cuenta sin rol → revert (`AccessControlUnauthorizedAccount`).
4. Firma un mensaje y modifica el mensaje antes de verificar → otra dirección recuperada.

## G. Privacidad (conceptual)
Todo en esta cadena es visible por todos los miembros. Besu soporta **grupos privados con Tessera** y **privacy groups** (estado privado compartido solo entre participantes, con un hash anclado en la cadena pública). Alternativas: guardar solo hashes (lo que hacemos), cifrar off-chain, o una cadena por subconsorcio.
