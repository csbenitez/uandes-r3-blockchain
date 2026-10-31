# Alcance entregado al rol 4 y limitaciones

El rol 1 implementó solo lo que E1 necesitaba: una interfaz y un contrato mínimo. **E4 sigue pendiente.** Ninguna prueba de E4 se ha ejecutado.

## Lo que ya existe

| Pieza | Estado |
|---|---|
| `IRegistroFacturas.sol` | Interfaz usada por E1 |
| `RegistroFacturasMinimo.sol` | Registro de huellas, con un único registrador |
| `RegistroFacturas.conformidad.test.js` | 8 pruebas de la interfaz |
| `deploy-e1.js` | Despliega cualquier implementación con `CONTRATO_REGISTRO` |

## Lo que falta frente a las láminas

| Compromiso | Lámina | Estado |
|---|---|---|
| `LiquidacionFacturas` | 11, 12, 21 | No existe |
| `EstadoLiquidaciones` (Data Contract) | 21 | No existe: lógica y datos están juntos |
| `RegistroLecturas` | 12 | No existe |
| `RegistroTarifas` | 12 | No existe |
| Doble firma en ajustes y tarifas | 21 | No existe |
| Ajustes encadenados | 6, 13 | No existe: una huella anclada no se puede reemplazar |
| Embedded Permission completo | 21 | Parcial: un solo registrador, fijo al desplegar |
| Bloqueo por mesh | 19, 23 | No existe: el repo no tiene Istio |
| `LiquidacionAnclada`, `AjusteAnclado`, `TarifaAnclada` | 16, 19 | No existen; hay solo `FacturaAnclada` |
| Análisis con Slither | Material del curso | No ejecutado |

## Decisiones que debe tomar el rol 4

1. **Saldos a favor:** `cop` es `uint96` y no admite negativos. Un prosumidor con total a favor no cabe. El generador evita ese caso, así que E1 no lo prueba. Recomiendo `int96` o un campo de signo.
2. **Huella vigente:** `huellaDe` debe devolver la última versión firmada tras un ajuste, conservando la cadena completa. Esto cambia lo que E1 considera `ÍNTEGRA` para una factura ajustada.
3. **Almacenamiento o evento:** hoy solo la huella va a almacenamiento; cuenta, periodo y totales van en el evento. La lámina 13 los lista como on-chain, pero un contrato no puede leer sus eventos. Si una regla los necesita, deben ir a almacenamiento y el gas por factura sube.
4. **Rol registrador:** debe poder cambiar mediante una transacción gobernada, y sin un administrador único.
5. **`MAX_LOTE`:** 100 viene de la lámina 15; E5 puede cambiarlo.

## Cómo conectarse

1. Implementa `IRegistroFacturas` en tu contrato, con constructor `(address registrador)`. Si necesitas otro constructor, ajusta `desplegar` en la prueba de conformidad y `deploy-e1.js`.
2. Valida:

   ```bash
   cd contracts-hardhat
   CONTRATO_REGISTRO=LiquidacionFacturas npx hardhat test test/RegistroFacturas.conformidad.test.js
   ```

3. Repite E1 sobre tu contrato:

   ```bash
   CONTRATO_REGISTRO=LiquidacionFacturas bash experimentos/e1-integridad/e1.sh correr
   ```

No hace falta cambiar `invoice-verifier` mientras la interfaz se mantenga.

## Lo que E1 no prueba sobre autorización

- Que una sola firma no alcance para ajustar.
- Que `billing-engine` quede bloqueado por el mesh.
- La rotación de roles o de llaves.

E1 sí cubre tres reglas del contrato mínimo: rechazo de escritores no autorizados, de otra huella para la misma factura y de lotes inválidos. Están en las pruebas de conformidad.
