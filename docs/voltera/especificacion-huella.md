# Especificación de huella de factura (E1)

Versión 1. Define qué se hashea y cómo, para que `billing-engine`, `invoice-verifier` y cualquier tercero calculen el mismo valor.

## Qué se hashea

La huella es el SHA-256 del **JSON canónico en claro** de la factura.

- No se hashea el objeto cifrado: volver a cifrar cambia los bytes sin cambiar la factura.
- El PDF es un derivado. Su SHA-256 va dentro del JSON en `pdfSha256`, así que alterar el PDF también se detecta.

## Forma canónica

Se basa en RFC 8785 (JCS), con restricciones para que todos los lenguajes coincidan:

1. **Codificación:** UTF-8, sin BOM.
2. **Cadenas y claves:** normalizadas a Unicode NFC antes de serializar.
3. **Objetos:** claves ordenadas por unidades de código UTF-16, sin espacios.
4. **Arreglos:** conservan su orden, porque el orden es significativo.
5. **Números:** solo enteros en notación simple dentro de ±(2^53 − 1). Se rechazan decimales, exponentes y `-0`.
6. **Claves duplicadas:** se rechazan, en el documento original y después de normalizar.

Un documento que no cumpla estas reglas no tiene huella y el verificador lo trata como `ALTERADA`.

## Unidades

| Dato | Unidad | Por qué |
|---|---|---|
| Energía | Wh, entero | Evita decimales |
| Dinero | COP, entero | Evita decimales |
| Fechas | Cadena ISO 8601 en UTC, terminada en `Z` | Una sola representación |

## Representación en cadena

| Dato | Tipo | Regla |
|---|---|---|
| `huella` | `bytes32` | Digest SHA-256 sin transformar |
| `facturaId` | `bytes32` | SHA-256 del identificador de negocio en UTF-8, por ejemplo `FAC-2026-10-0000001` |
| `cuenta` | `bytes32` | HMAC-SHA256 del NIC con una sal off-chain |

## Resultado de la verificación

| Condición | Resultado |
|---|---|
| No hay huella en la cadena para el `facturaId` | `NO ANCLADA` |
| La huella calculada coincide con la de la cadena | `ÍNTEGRA` |
| No coincide, o el documento no se puede leer o canonicalizar | `ALTERADA` |

`NO ANCLADA` se evalúa primero: indica que no hay contra qué comparar. Una factura en espera de anclaje da `NO ANCLADA`, y `anclaje pendiente` se muestra como estado aparte, no como un cuarto resultado.

## Límite conocido

Esta huella no detecta un error introducido **antes** de calcularla: en ese caso se sella el documento equivocado (lámina 21).
