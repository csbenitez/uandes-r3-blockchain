# 03 · Hash, claves asimétricas y firmas

## Hash (keccak256)
Función determinista de un solo sentido: mismo archivo → mismo hash de 32 bytes; cambiar un bit → hash totalmente distinto. En la cadena guardamos el hash del documento, no el documento: **prueba de existencia e integridad** sin exponer contenido.
Ojo: Ethereum usa **keccak256** (no es SHA-256 ni exactamente SHA3-256 del NIST).

## Par de claves (secp256k1)
- **Privada**: 32 bytes aleatorios. Quien la tiene, controla la cuenta.
- **Pública**: punto de la curva (64 bytes), derivada de la privada; no se puede invertir.
- **Dirección**: últimos 20 bytes de `keccak256(publica)`. Ej.: `0xFE3B…Bd73`.

```
privada ──(curva elíptica)──► pública ──(keccak256, últimos 20 bytes)──► dirección
```

## Firma ECDSA
Firmar = probar que posees la privada sin revelarla. Sale `(r, s, v)`; `v` (27/28) permite **recuperar la pública** (`ecrecover`), así la dirección del firmante sale de la propia firma. Por eso una tx no incluye campo "from": se deduce de la firma.

Tres cosas que se firman:
1. **Transacciones** (EIP-155 incluye el `chainId` para evitar replay en otra red).
2. **Mensajes** `personal_sign` (EIP-191): se firma `keccak256("\x19Ethereum Signed Message:\n" + len + msg)`. El prefijo impide que una firma de mensaje sirva como tx.
3. **Datos tipados** (EIP-712): estructuras legibles en Metamask (permisos, órdenes).

## Ejercicios con el KMS del taller
```bash
# 1) importar la cuenta de prueba (en un HSM real NO se permite importar)
curl -s -X POST localhost:7070/keys/import -H 'content-type: application/json' \
  -d '{"privateKey":"0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63"}'
# 2) firmar un mensaje
curl -s -X POST localhost:7070/keys/fe3b557e8fb62b89/sign -H 'content-type: application/json' -d '{"message":"hola"}'
# 3) verificar -> devuelve la dirección recuperada
curl -s -X POST localhost:7070/verify -H 'content-type: application/json' \
  -d '{"message":"hola","signature":"0x<la_firma>","address":"0xfe3b557e8fb62b89f4916b721be55ceb828dbd73"}'
```
Prueba: cambia una letra del mensaje en el paso 3 → `recovered` será **otra dirección** (la firma ya no corresponde). Además, firma el mismo mensaje en la dApp (sección 4, Metamask con la misma llave) y compara.

## Qué garantiza y qué no
Garantiza: autoría (no repudio), integridad, orden y sello de tiempo (el del bloque). No garantiza: que el contenido sea verdadero, ni identidad legal real (la llave es solo un número; el vínculo persona-llave es organizacional).
