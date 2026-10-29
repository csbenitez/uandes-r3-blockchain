# 00 · De la web tradicional a blockchain

## La idea en una frase
Una base de datos **replicada en varios servidores de organizaciones distintas** que no se fían entre sí, donde solo se puede **agregar** (nunca editar) y todos acuerdan el orden mediante un protocolo de **consenso**.

| Web tradicional | Blockchain de consorcio |
|---|---|
| Un servidor/BD mandan; el cliente confía en el operador | Varios nodos, ninguno manda solo |
| `UPDATE`/`DELETE` | Solo `append`; corregir = nuevo registro |
| Usuario + contraseña en tu BD | Par de claves; la **firma** prueba quién actuó |
| API REST como lógica | **Smart contract**: código desplegado en la cadena |
| Backend ejecuta una vez | Cada nodo ejecuta lo mismo y debe obtener el mismo resultado (determinismo) |
| Costo = infra | Costo = gas (en consorcio suele ser 0, como aquí) |

## Glosario mínimo
- **Nodo**: proceso Besu con copia completa de la cadena (`node1..4`).
- **Validador**: nodo con derecho a proponer/votar bloques (aquí los 4).
- **Cuenta EOA**: controlada por una llave privada (Metamask, KMS). **Cuenta de contrato**: código + almacenamiento, sin llave.
- **Transacción**: mensaje firmado (`from`, `to`, `data`, `nonce`, `gas`, firma r,s,v). Cambia el estado.
- **Bloque**: lote ordenado de transacciones + hash del bloque previo (de ahí "cadena").
- **Gas**: medida de cómputo. Evita bucles infinitos. Aquí `gasPrice=0` (consorcio).
- **Evento (log)**: salida barata que el contrato emite; no la lee otro contrato, la leen servicios externos (nuestro indexador Go).
- **ABI**: descripción JSON de las funciones/eventos del contrato; es el "OpenAPI" del contrato.
- **Finalidad**: cuándo una tx ya no puede revertirse. En QBFT es **inmediata** al entrar en un bloque.

## ¿Qué es una DApp?
Una app cuya **lógica y estado críticos viven en contratos** y donde el usuario **firma con su propia llave**. El front puede ser web normal; lo que la hace "descentralizada" es que ningún backend único puede falsificar o borrar los registros. Nuestra dApp (`dapp/`): front estático + Metamask + contrato; el backend Go es solo conveniencia (índice y consultas rápidas), no autoridad.

Lo que **no** es dApp: una web con un botón "pagar con cripto" y la lógica en tu servidor. Ver `10-es-tu-servicio-una-dapp.md`.

## Mapa del taller
Contrato (`EventRegistry.sol`) → compilado a bytecode+ABI → desplegado por una tx → los usuarios llaman `registerEvent` firmando → el bloque lo confirma por QBFT → emite `EventRegistered` → el indexador Go lo guarda en SQLite → la dApp lo muestra.
