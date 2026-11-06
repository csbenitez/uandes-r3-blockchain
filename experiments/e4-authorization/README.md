# E4 · Autorización y Doble Firma

## 1. Objetivo

Validar la arquitectura de autorización propuesta para los ajustes de facturas de Voltera mediante smart contracts.

El experimento comprueba dos patrones de arquitectura blockchain:

- **Multiple Authorization:** un ajuste de una factura anclada requiere autorización independiente de Voltera y SSPD.
- **Embedded Permission:** únicamente las identidades con roles explícitamente autorizados pueden ejecutar operaciones sensibles sobre el contrato.

El objetivo experimental es demostrar que:

1. Una sola autorización de Voltera no permite ejecutar un ajuste.
2. La autorización conjunta de Voltera y SSPD permite ejecutar el ajuste.
3. Un actor no autorizado, como `billing-engine`, no puede escribir directamente en el contrato.
4. Una misma identidad no puede representar simultáneamente a Voltera y SSPD.

---

## 2. Hipótesis

> Una sola parte no puede ajustar unilateralmente una factura previamente anclada. El ajuste únicamente debe ejecutarse cuando existan autorizaciones independientes de Voltera y SSPD, y cualquier actor sin permisos debe ser rechazado por el smart contract.

---

## 3. Arquitectura validada

```text
billing-engine
      │
      │ FacturaEmitida
      ▼
Event Mesh
      │
      ▼
settlement-ledger
      │
      │ REGISTRAR_ROLE
      ▼
LiquidacionFacturas.sol
      │
      ├──────────────┐
      │              │
      ▼              ▼
   Voltera          SSPD
 VOLTERA_ROLE     SSPD_ROLE
      │              │
      └──────┬───────┘
             │
             ▼
       AjusteAnclado
             │
             ▼
       Hyperledger Besu
             │
             ▼
           QBFT
```

`billing-engine` no posee `REGISTRAR_ROLE`, por lo cual no puede escribir directamente sobre el contrato.

La interacción con blockchain queda encapsulada en `settlement-ledger`, evitando que los demás microservicios conozcan detalles de Besu o de los smart contracts.

---

## 4. Tecnologías

| Componente | Versión / uso |
|---|---|
| Solidity | 0.8.24 |
| Hardhat | 2.29.1 |
| OpenZeppelin Contracts | 5.x |
| Hyperledger Besu | 25.7.0 |
| Consenso | QBFT |
| Nodos validadores | 4 |
| Chain ID | 20261 |
| EVM target | Paris |

---

## 5. Contrato

Contrato implementado:

```text
contracts-hardhat/contracts/LiquidacionFacturas.sol
```

El contrato implementa:

```text
IRegistroFacturas
```

y utiliza:

```text
OpenZeppelin AccessControl
```

para los siguientes roles:

```text
REGISTRAR_ROLE
VOLTERA_ROLE
SSPD_ROLE
```

### Responsabilidades

**REGISTRAR_ROLE**

Representa al componente autorizado para interactuar operativamente con la cadena, conceptualmente `settlement-ledger`.

Puede:

- registrar facturas;
- proponer ajustes;
- ejecutar un ajuste una vez cumplida la doble autorización.

**VOLTERA_ROLE**

Permite registrar la aprobación de Voltera sobre un ajuste.

**SSPD_ROLE**

Permite registrar la aprobación independiente del ente de control.

---

## 6. Compatibilidad con la arquitectura existente

Antes de ejecutar el experimento E4, `LiquidacionFacturas` fue validado contra las pruebas existentes de `IRegistroFacturas`.

Comando:

```powershell
$env:CONTRATO_REGISTRO="LiquidacionFacturas"
npx hardhat test .\test\RegistroFacturas.conformidad.test.js
```

Resultado:

```text
8 passing
0 failing
```

Esto demuestra que la incorporación de autorización y ajustes no rompe el contrato de integración utilizado por la implementación previa `RegistroFacturasMinimo`.

---

## 7. Pruebas E4 en Hardhat

Archivo:

```text
contracts-hardhat/test/LiquidacionFacturas.E4.test.js
```

Ejecución:

```powershell
cd contracts-hardhat
npx hardhat test .\test\LiquidacionFacturas.E4.test.js
```

Resultado:

```text
E4 - Autorizacion y doble firma

✔ E4.1 - una firma de Voltera no es suficiente
✔ E4.2 - Voltera y SSPD autorizan el ajuste
✔ E4.3 - billing-engine no puede escribir en el contrato
✔ E4.4 - una misma identidad no puede representar Voltera y SSPD

4 passing
```

### E4.1 · Una sola autorización

Estímulo:

```text
Voltera aprueba
SSPD no aprueba
```

Resultado esperado:

```text
REVERT
```

Resultado obtenido:

```text
DobleFirmaRequerida
```

La huella de la factura permanece sin modificaciones.

**Resultado: PASS**

---

### E4.2 · Doble autorización

Estímulo:

```text
Voltera aprueba
+
SSPD aprueba
```

Resultado esperado:

```text
AjusteAnclado
```

Resultado obtenido:

```text
AjusteAnclado
```

La huella vigente de la factura es reemplazada por la nueva huella únicamente después de cumplirse ambas autorizaciones.

**Resultado: PASS**

---

### E4.3 · Actor no autorizado

Estímulo:

```text
billing-engine
→ proponerAjuste()
```

`billing-engine` no posee `REGISTRAR_ROLE`.

Resultado:

```text
AccessControlUnauthorizedAccount
```

**Resultado: PASS**

---

### E4.4 · Segregación de funciones

Se asignaron temporalmente los dos roles a una misma identidad para verificar que una única cuenta no pudiera representar simultáneamente a Voltera y SSPD.

Resultado:

```text
FirmaDuplicada
```

Esto garantiza que las dos autorizaciones correspondan a identidades distintas.

**Resultado: PASS**

---

# 8. Validación sobre Hyperledger Besu

Además de las pruebas locales de Hardhat, el contrato fue desplegado y probado sobre la red Besu permissioned del proyecto.

La red utilizada contiene cuatro nodos Besu ejecutando consenso QBFT.

## Despliegue

Script:

```text
contracts-hardhat/scripts/deploy-e4.js
```

Ejecución:

```powershell
npx hardhat run .\scripts\deploy-e4.js --network besu
```

Resultado:

```text
Network : besu
ChainId : 20261
Block   : 167
```

### Dirección del contrato

```text
0x42699A7612A82f1d9C36148af9C77354759b210b
```

### Transacción de despliegue

```text
0x844e629d6f58e7cca39f4fbd71d224bf44c9031901fbabf26343c5f4ed117320
```

La información del despliegue, incluida la ABI, se conserva en:

```text
deployments/e4-besu.json
```

---

# 9. Ejecución E4 sobre Besu

Script:

```text
contracts-hardhat/scripts/run-e4-besu.js
```

Comando:

```powershell
npx hardhat run .\scripts\run-e4-besu.js --network besu
```

## Preparación

Se utilizaron identidades independientes para:

```text
Voltera
SSPD
billing-engine
```

Roles asignados:

```text
Voltera        → VOLTERA_ROLE
SSPD           → SSPD_ROLE
settlement     → REGISTRAR_ROLE
billing-engine → sin rol de escritura
```

---

## E4.1 · Una autorización

Voltera autorizó el ajuste.

Transacción de aprobación de Voltera:

```text
0x86a27994f50bf7765f949fbb105fddc6e477224ae58e6ee3902ef5fe42965677
```

Posteriormente se intentó ejecutar el ajuste sin autorización de SSPD.

Resultado:

```text
REVERTIDO
```

Transacción revertida:

```text
0x96ca2cc44714bf0ab809cdb3b262916077aed5b535322d59895d423414e62183
```

**Resultado: PASS**

---

## E4.2 · Voltera + SSPD

SSPD registró la segunda autorización.

Transacción SSPD:

```text
0x94fdc5737bb6c8b8d7de4d2fd070223416752fdce5449c024ce1532544efbbb8
```

Posteriormente se ejecutó el ajuste.

Resultado:

```text
AJUSTE ANCLADO
```

Transacción:

```text
0x0fe49bc9ef18e4a7d3559deb0d9d7a47cfc850ddaae5adeed9edeb6b6d77f526
```

Bloque:

```text
244
```

Verificación posterior:

```text
Huella actualizada : SI
```

**Resultado: PASS**

---

## E4.3 · billing-engine sin autorización

`billing-engine` intentó ejecutar una operación reservada al registrador.

Resultado:

```text
BLOQUEADO
```

Transacción revertida:

```text
0xd4ba070daf666ee6014511554c3ff54b4d9e4454fc3e0f3383aefc83ceb61dbf
```

**Resultado: PASS**

---

# 10. Resumen experimental

| Caso | Resultado esperado | Resultado obtenido | Estado |
|---|---|---|---|
| E4.1 · Solo Voltera | Revert | Revertido | PASS |
| E4.2 · Voltera + SSPD | AjusteAnclado | AjusteAnclado | PASS |
| E4.3 · billing-engine | Bloqueado | Bloqueado | PASS |
| E4.4 · Misma identidad con ambos roles | Revert | FirmaDuplicada | PASS |
| Conformidad IRegistroFacturas | Sin regresiones | 8/8 | PASS |

---

# 11. Evidencia adicional

Transacción de registro de factura:

```text
0x4dc490983f8616b36ed70e12b73ff9a762bbdfc9884ee1aed2a2ca097dcd106d
```

Transacción de propuesta de ajuste:

```text
0xb4969f011c3a64521a23ec810a8b5e0df866fb44a93289c1838601fbe96b1aa0
```

Contrato:

```text
0x42699A7612A82f1d9C36148af9C77354759b210b
```

Chain ID:

```text
20261
```

---

# 12. Conclusión

El experimento E4 valida que la política de autorización no depende únicamente de los microservicios de aplicación.

Las reglas críticas se encuentran embebidas en el smart contract:

```text
1 autorización
→ no puede modificar la factura

Voltera + SSPD
→ pueden ejecutar el ajuste

actor no autorizado
→ no puede escribir
```

La arquitectura implementa así defensa en profundidad.

El patrón **Multiple Authorization** impide que Voltera pueda modificar unilateralmente una factura previamente anclada.

El patrón **Embedded Permission** restringe las operaciones blockchain según la identidad y los roles asignados.

Las pruebas fueron ejecutadas primero sobre Hardhat y posteriormente sobre la red Hyperledger Besu de cuatro nodos utilizando QBFT, obteniéndose el comportamiento esperado en todos los escenarios.

## Resultado final

```text
Conformidad IRegistroFacturas : 8/8 PASS
Pruebas E4 Hardhat            : 4/4 PASS
E4 sobre Besu                 : PASS
Multiple Authorization        : VALIDADO
Embedded Permission           : VALIDADO
```