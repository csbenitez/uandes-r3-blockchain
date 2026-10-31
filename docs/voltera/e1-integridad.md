# E1 · Manipulación off-chain

**Resultado:** cumple. Sobre Besu con 4 validadores se detectaron 1.000 de 1.000 alteraciones, con 0 falsos positivos en 10.000 facturas íntegras.

**Hipótesis (lámina 23):** alterar el documento de una factura anclada se detecta.

## Cómo ejecutarlo

Requisitos en WSL o Linux: Docker con el plugin Compose, Go 1.26+, Node 20+, Python 3, `curl` y `openssl`.

Clona el repo en el sistema de archivos de Linux (`~/`), no en `/mnt/c`, y deja la terminal abierta: al cerrar la última sesión, WSL se apaga y tumba los contenedores.

```bash
bash experimentos/e1-integridad/e1.sh todo
```

Abre `http://localhost:3001/d/e1-integridad` antes de lanzar `correr`. La ejecución es rápida: unos 18 s sin contar la preparación. Para el video, `E1_CONCURRENCIA=1` hace la fase 4 más lenta y visible. Con la red ya arriba:

```bash
E1_CONCURRENCIA=1 bash experimentos/e1-integridad/e1.sh correr
bash experimentos/e1-integridad/e1.sh consultar alterada
```

El resto de comandos está en [consumo-por-roles.md](consumo-por-roles.md#comandos).

## Fases

| Fase | Qué ocurre | Dónde se ve |
|---|---|---|
| F1 · Emisión | 11.250 facturas sintéticas, huella calculada y documentos cifrados | Terminal |
| F2 · Anclaje | 11.050 huellas en lotes de 100 | `Facturas ancladas` |
| F3 · Alteración | 1.000 documentos cambian después del anclaje | Terminal |
| F4 · Verificación | 11.250 consultas a `invoice-verifier`, que lee la copia del nodo 3 | `Detectadas`, `Falsos positivos` |
| F5 · Evaluación | Criterios, controles y evidencias | `Criterio E1` |

## Conjunto de prueba

| Grupo | Cantidad | Qué prueba |
|---|---|---|
| Íntegras | 10.000 | Original y 5 variantes equivalentes: orden de claves, espacios, NFD, escapes y combinada |
| Alteradas | 1.000 | 16 tipos, después del anclaje |
| Sin anclar | 200 | Deben dar `NO ANCLADA` |
| Límite conocido | 50 | Error previo al hash; no se detecta y no cuenta en el criterio |

Salvo `cifrado_sin_llave` y `documento_eliminado`, cada alteración descifra, cambia y vuelve a cifrar. Así quien detecta es la huella y no AES-GCM.

**Por qué puede fallar:** SHA-256 detecta cualquier cambio de bytes, de modo que el riesgo real son los falsos positivos por serialización y las diferencias entre lenguajes. Aquí emite Node y verifica Go. El control sin forma canónica mide lo que pasaría sin esa protección.

## Resultados

Medidos sobre 4 validadores Besu 25.7.0 con QBFT y semilla `voltera-e1`. La evidencia que genera el sistema está en `experimentos/e1-integridad/resultados/besu/`.

| Medida | Comprometido | Obtenido |
|---|---|---|
| Alteraciones detectadas | 1.000 | 1.000 |
| Falsos positivos | 0 de 10.000 | 0 |
| `NO ANCLADA` correctas | 200 | 200 |
| Control sin canónica (falsos positivos) | Mayor que 0 | 8.333 |
| Alteraciones previas al hash sin detectar | 50 de 50 | 50 |

El gas fue de 27.671 por factura en lotes de 100.

Los tiempos que aparecen en los resúmenes vienen de un experimento de integridad en un solo host. No sirven como capacidad: eso lo mide E5.

Cada `correr` guarda su evidencia en `resultados/besu/historial/<fecha>_<commit>_c<concurrencia>_n<facturas>/`: `ejecucion.log` siempre, `resumen.json` si terminó y `resultados.csv` con `E1_OFICIAL=1`.

## Fallas encontradas durante la ejecución

| Falla | Causa | Solución |
|---|---|---|
| 503 tras unas 4.100 verificaciones | Un `eth_getLogs` por consulta recorría todos los bloques y agotaba el tiempo de espera de Besu | Índice incremental para `txHash`; la huella se sigue leyendo del contrato |
| `Internal error` al anclar, intermitente | `eth_estimateGas` falla mientras Besu importa un bloque | `gasLimit` fijo de 35.000 por factura y reintentos contados |
| `HuellaDistinta` al repetir una corrida | Reutilizar el contrato con otras facturas | Contrato nuevo en cada `correr`; el contrato actuó bien |

La primera falla es relevante para los roles 3 y 5: **no hagan un `eth_getLogs` por consulta ni dependan de `eth_estimateGas` en lotes.**

## Simplificaciones declaradas

| Pieza | Lámina | En E1 |
|---|---|---|
| Registro | `LiquidacionFacturas` | `RegistroFacturasMinimo` |
| Lectura de la cadena | Vía `settlement-ledger` | `invoice-verifier` lee el contrato |
| Anclaje | `settlement-ledger` con KMS | Conductor con cuenta de prueba |
| Emisión | `billing-engine` | Generador sintético |
| Almacenamiento | Servicio de objetos cifrado | Carpeta local con AES-256-GCM |
| Consorcio | 4 organizaciones | 4 nodos en un host |
| Service mesh | Istio con mTLS | Red de Docker, sin Istio |
| Llave de documentos | KMS | Variable de entorno por corrida |

**No se tumba ningún servicio:** E1 mide integridad, no disponibilidad. Eso es E2.

## Lo que E1 no demuestra

- Un error introducido antes del hash no se detecta (lámina 21).
- No cubre ajustes con doble firma: eso es E4.
- La consistencia entre lenguajes se comprobó con Node, Go y Python, no contra `billing-engine`, que aún no existe.
