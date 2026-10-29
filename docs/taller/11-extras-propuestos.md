# 11 · Extras que te propongo

1. **Merkle tree de lotes**: anclar un solo hash raíz cada N minutos y probar pertenencia con *Merkle proof* (reduce gas y volumen).
2. **EIP-712 meta-transacciones**: el usuario firma off-chain y un *relayer* (el indexador) paga/envía; añade `nonce` y `deadline` en el contrato.
3. **Multisig para el rol admin** (Safe o un `AccessControl` con `TimelockController`): ningún admin único.
4. **Proxy UUPS**: contrato actualizable con gobierno y pruebas de que el almacenamiento no se corrompe.
5. **IPFS** (contenedor `ipfs/kubo`): guardar el documento off-chain direccionado por contenido; `uri = ipfs://CID`.
6. **Firmas ECDSA vs. Ed25519/HSM P-256**: por qué los HSM suelen no soportar secp256k1 y cómo firmar con AWS KMS (`ECC_SECG_P256K1`).
7. **Foundry/`cast`**: probar la misma cadena con otra herramienta (`cast send`, `cast call`, tests fuzz en Solidity).
8. **The Graph local o `ethers` + SQLite**: comparar el indexador propio con un subgrafo.
9. **Permisos on-chain de nodos y cuentas** y rotación de validadores.
10. **CI**: GitHub Actions que levanta la red con compose y corre `hardhat test` + `go test`.
11. **TLS y autenticación** (reverse proxy con mTLS) para RPC y KMS; quitar CORS `*`.
12. **Pruebas de carga** (`autocannon` contra RPC) para medir TPS y latencia con bloques de 2 s.
13. **Auditoría estática**: `slither` o `solhint` sobre `EventRegistry.sol`.
