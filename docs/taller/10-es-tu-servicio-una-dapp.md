# 10 · ¿Mi servicio puede ser una dApp?

Pregunta clave: **¿qué problema de confianza resuelve la cadena que una base de datos no?** Si la respuesta es "ninguno", usa una BD.

## Checklist (cuenta cuántos "sí")
1. ¿Participan **varias organizaciones** que no quieren depender del servidor de una sola?
2. ¿Necesitas un registro **inmutable y auditable** (quién, qué, cuándo) que ninguna parte pueda reescribir?
3. ¿Hay **reglas compartidas** que deben ejecutarse igual para todos (smart contract) sin intermediario?
4. ¿La **identidad por firma** (llaves) es aceptable para los actores?
5. ¿Lo que se guarda on-chain cabe como **hash/metadatos** pequeños? (lo pesado va off-chain)
6. ¿El volumen es moderado? (decenas–cientos de tx/s, no millones)
7. ¿Puedes tolerar **no poder borrar** datos on-chain?

- 5–7 "sí": buen candidato.
- 3–4: híbrido (BD + ancla de hashes).
- 0–2: no uses blockchain.

## Aplicado a este taller (registro de eventos)
Varias partes (emisores), prueba de existencia e integridad, auditoría, datos = hash. **Sí es un buen caso**: es un patrón de "notarización". Lo que **no** es descentralizado hoy: una red de 4 nodos en un solo host y una sola organización; en un consorcio real cada organización opera su nodo.

## ¿Es el caso Voltera (docs/)?
Aplica la lista al dominio de Voltera: quiénes son las partes, qué evento necesitan probar, qué dato ancla (hash), quién valida. Si el flujo es entre pocas partes que ya confían en una plataforma central, probablemente una BD con auditoría bastaría; si hay conflicto de intereses entre partes (fabricante, operador, regulador…), el ancla en cadena aporta valor. Completa:

| Pregunta | Respuesta para Voltera |
|---|---|
| Partes que no confían entre sí | |
| Evento a probar | |
| ¿Qué va on-chain? (hash/id) | |
| ¿Qué va off-chain? | |
| Quién corre nodos | |
| ¿Datos personales? | |

## Anti-patrones
- Guardar **datos personales** o documentos completos on-chain (derecho al olvido/Habeas Data/RGPD imposible).
- Alta frecuencia o mucho dato (telemetría de sensores): ancla un **hash de lotes** (Merkle root) cada N segundos.
- "Blockchain" con un único operador que controla todos los nodos: es una BD cara.
- Contratos con lógica cambiante sin plan de actualización/gobierno.
- Confiar en que "está en la cadena" implica que es **verdad**: la cadena prueba que alguien lo firmó, no que sea cierto (problema del oráculo).
- Poner llaves privadas en el backend: usa KMS/HSM.

## Arquitectura recomendada de referencia
Front dApp + Metamask/KMS → contratos finos (hashes, roles, eventos) → indexador (BD para consultas) → almacenamiento off-chain (S3/IPFS) referenciado por URI y hash.
