# 05 · Remix IDE (editor tipo "IDE web" para Solidity)

Remix corre en Docker: `.\taller.ps1 up -Tools` → http://localhost:8080

## Pasos
1. **File explorer** → nuevo archivo `EventRegistry.sol`. Pega el contenido de `contracts-hardhat/contracts/EventRegistry.sol`. Remix resuelve `@openzeppelin/...` desde GitHub/npm automáticamente.
2. **Solidity compiler**: versión `0.8.24`, *Advanced*: EVM version **paris**, optimizer 200. Compilar.
3. **Deploy & run**: en *Environment* elige:
   - **Injected Provider – MetaMask** (usa tu billetera, recomendada), o
   - **Custom – External Http Provider** → `http://localhost:8545`.
4. Constructor: parámetro `admin` = tu dirección. **Deploy**. Firma en Metamask.
5. Abajo, en *Deployed Contracts*, prueba `registerEvent` (necesitas un `bytes32`: en la consola de Remix `ethers.utils.keccak256(ethers.utils.toUtf8Bytes("hola"))` o pega `0x` + 64 hex), `verify`, `totalEvents`.
6. Mira el **log de la tx**: bloque, gas, `logs` (el evento decodificado), `decoded input`.

> Nota: si Remix en Docker no resuelve imports (sin internet), usa **remixd** o copia los .sol de `node_modules/@openzeppelin`. Si Remix desde `localhost:8080` no conecta al RPC por CORS, ya está habilitado en `config.toml`.

## Qué aprender aquí
- Cada despliegue es una **transacción** con `to` vacío; el resultado es una dirección nueva.
- Puedes llamar un contrato **ya desplegado** (el de Hardhat) con *At Address* + el ABI: la dirección y ABI están en `deployments/besu.json`.
- Diferencia **call** (lectura, gratis, sin tx) vs **transact** (escritura, firmada, consume gas).
- Remix es para explorar; para equipo/CI se usa Hardhat (siguiente guía).
