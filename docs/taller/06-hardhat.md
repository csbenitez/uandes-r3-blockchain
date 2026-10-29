# 06 · Hardhat: compilar, probar, desplegar y gestionar contratos

```powershell
cd contracts-hardhat
npm install
npx hardhat compile          # solc 0.8.24 -> artifacts/ (ABI + bytecode)
npx hardhat test             # red efímera en memoria (rápido, sin Docker)
npx hardhat run scripts/deploy.js   --network besu   # a TU red QBFT
npx hardhat run scripts/interact.js --network besu
```
`hardhat.config.js` define la red `besu` (chainId 20261, cuenta del `.env`, `gasPrice 0`) y `evmVersion: paris`.

## Contratos
**`EventRegistry.sol`** (OpenZeppelin `AccessControl` + `Pausable`)
- `registerEvent(bytes32 docHash, string kind, string uri)` solo con `REGISTRAR_ROLE`; rechaza duplicados (`AlreadyRegistered`) y hash vacío; emite `EventRegistered`.
- `verify(docHash)` → `(exists, Record)`; vista, sin gas.
- `pause()/unpause()` solo admin.
Patrones útiles: **solo el hash on-chain**, errores personalizados (más baratos que strings), eventos para el off-chain, roles en vez de un único `owner`.

**`SimpleToken.sol`**: ERC-20 estándar para ver tokens en Metamask.

## Qué hace `deploy.js`
Despliega ambos, espera el recibo y escribe `deployments/besu.json` con dirección, **ABI** y bloque de despliegue. Ese archivo es el contrato entre tus piezas: lo leen el indexador Go y la dApp.

## Gestión del ciclo de vida
| Necesidad | Cómo |
|---|---|
| Dar permiso a otra organización | `grantRole(REGISTRAR_ROLE, 0x…)` por el admin |
| Quitar acceso | `revokeRole` |
| Emergencia | `pause()`; las escrituras revierten, las lecturas siguen |
| Contrato **inmutable** | El código no se edita. Un bug = desplegar uno nuevo y migrar |
| Actualizable | Patrón **proxy** (UUPS/Transparent de OpenZeppelin): la dirección pública es un proxy que delega a una implementación reemplazable. Costo: más complejidad y confianza en quien actualiza (usar multisig/gobernanza) |
| Verificar que el código desplegado es el esperado | Comparar `eth_getCode(address)` con `deployedBytecode` de `artifacts/` |

Tarea: añade un rol `AUDITOR_ROLE` solo-lectura (modificador en `verify`), escribe el test y redespliega.

## Tests
`test/EventRegistry.test.js` (Chai + ethers v6): evento emitido, duplicados, roles, pausa. Regla: toda regla de negocio del contrato debe tener su test **antes** de desplegar, porque desplegar es irreversible.

## Ver el recibo
`interact.js` imprime bloque, `gasUsed` y status. En la cadena nada se "actualiza": la prueba de que ocurrió es el recibo y el log en un bloque final.
