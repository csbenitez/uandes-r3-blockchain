# 04 · Billeteras, KMS/HSM y Metamask

Una **billetera** no guarda monedas: guarda **llaves** y firma. El saldo vive en la cadena.

| Tipo | Dónde está la llave | Ejemplo | Riesgo |
|---|---|---|---|
| Navegador / no custodial | Cifrada en el equipo del usuario | **Metamask** | Si pierde la frase semilla, pierde todo |
| Hardware | Dispositivo físico | Ledger, Trezor | Pérdida/robo físico |
| **KMS / HSM** | Módulo protegido; solo expone "firmar" | AWS KMS, Vault, HSM PKCS#11 | Control de acceso mal configurado |
| Custodial | La guarda un tercero | Exchanges | Dependes del tercero |

## Frase semilla (BIP-39/44)
12–24 palabras → semilla → llaves hijas deterministas (ruta `m/44'/60'/0'/0/n`). Una frase genera infinitas cuentas.

## KMS simulado del taller (`services/cmd/kms`)
- Llaves en `kms-data` cifradas con **AES-256-GCM** (llave maestra `KMS_MASTER_KEY` del `.env`; en producción vive en un HSM).
- API: crear llave, firmar digest/mensaje, firmar tx, verificar. **Nunca** devuelve la privada.
- Bitácora `audit.log` de cada firma (el control que da un KMS: quién firmó qué y cuándo).
- Pruébalo: `docker exec kms cat /data/audit.log` y mira el archivo `*.key.json` (solo ciphertext).
- Limitaciones honestas: sin autenticación de clientes, la llave maestra está en una variable de entorno, se puede importar. Un KMS real añade IAM/políticas, rotación, HSM FIPS 140-2/3 y doble control.

Flujo "backend sin llaves": `POST /register` del indexador → arma la tx → pide la firma al KMS → envía `eth_sendRawTransaction`. Si hackean el backend, no se llevan la llave; solo pueden pedir firmas mientras tengan acceso (por eso hay políticas y auditoría).

## Metamask paso a paso
1. Instala la extensión y crea una cartera (o usa una de pruebas).
2. En la dApp pulsa **Conectar**: ejecuta `wallet_addEthereumChain` → red `20261`, RPC `http://localhost:8545`. (Manual: Redes → Agregar → los mismos datos).
3. **Importar cuenta** → llave privada del `.env` (`0xfe3b…`): ya tiene fondos del genesis (no los necesita para gas, es `gasPrice 0`).
4. Importa el token: *Importar tokens* → dirección de `SimpleToken` en `deployments/besu.json` (TLR, 1 000 000).
5. Registra un archivo en la dApp: Metamask muestra la tx; **tú firmas**, el navegador envía.

Compara en tu cabeza dos modelos de firma: **Metamask** (usuario final firma cada acción) vs **KMS** (servicio firma en nombre de una organización). Un consorcio real suele usar ambos.
