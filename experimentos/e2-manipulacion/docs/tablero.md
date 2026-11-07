# E2 · Tablero de Grafana

[← Volver al README de E2](../README.md)

Grafana: http://localhost:3001 → **E2 · Manipulación del libro** (definido en `monitoring/grafana/tableros/e2-manipulacion.json`, acceso anónimo). Los datos vienen de dos jobs de Prometheus (`monitoring/prometheus.yml`): `besu` (métricas propias de cada nodo, cada 5 s) y `e2-experimento` (lo que publica `guiado.js` en `:9465`, cada 2 s). El tablero refresca cada 2 s (Grafana se levanta con `GF_DASHBOARDS_MIN_REFRESH_INTERVAL=1s`; sin eso lo sube a 5 s). Sin `guiado.js` corriendo, los paneles `e2_*` quedan vacíos; los stats conservan el último valor 1 min y el autopiloto sigue publicando al terminar hasta que se pulsa Enter.

## Paneles

El tablero muestra solo lo que mide el criterio de éxito de E2. Las demás métricas (latencia, lotes, ciclos omitidos, etc.) siguen publicándose en `:9465` y se pueden consultar en Explore.

| Panel | Métrica | Qué muestra |
|---|---|---|
| Nodos en desacuerdo | `e2_nodos_en_desacuerdo` | Nodos cuyo hash difiere de la mayoría (0 = todos coinciden) |
| Detección (bloques) · meta ≤ 1 | `e2_deteccion_bloques` | Bloques entre la manipulación de node4 y su detección (paso 3) |
| Estado de la red | `e2_red_detenida` | PRODUCIENDO / DETENIDA (más de 8 s sin bloque) |
| Recuperación (s) | `e2_recuperacion_s` | Del regreso de los nodos al primer lote confirmado (paso 7; −1 = no se recuperó) |
| Criterio E2 | `e2_criterio_cumplido` | Veredicto final |
| Paso del experimento | `e2_fase` | Franja de tiempo con el paso que corría; regla para leer los demás paneles |
| Estado por nodo | `e2_nodo_estado{nodo}` | Franja por nodo: verde ok, naranja DIVERGE, rojo CAÍDO |
| Altura por nodo | `ethereum_blockchain_height` | Bloque de cada nodo; se congela sin quórum |
| Facturas: confirmadas y pendientes | `e2_facturas_confirmadas`, `e2_facturas_pendientes` | Si la carga sigue confirmando y cuánto backlog se acumula |

## Qué esperar en cada paso

Cada estado dura al menos `-Pausa` segundos. En una ventana de 15 min los pasos 3–6 ocupan unos 2 min: acerca la ventana a 5 min para verlos con detalle.

| Paso | Estado por nodo | Altura | Facturas | Stats |
|---|---|---|---|---|
| 1 Red sana | 4 verdes | 4 líneas juntas | — | Desacuerdo 0 · PRODUCIENDO |
| 2 Carga | 4 verdes | sube | Confirmadas sube; pendientes bajo | Desacuerdo 0 |
| 3 node4 miente | node4 naranja | sube | Sigue igual | Desacuerdo 1 · Detección 0–1 |
| 4 Restaurar node4 | 4 verdes | sube | Sigue igual | Desacuerdo 0 |
| 5 Cae node4 | node4 rojo | 3 líneas suben | Sigue igual | PRODUCIENDO |
| 6 Caen node4 y node3 | 2 rojos | se congela | Confirmadas plana; pendientes sube | DETENIDA |
| 7 Recuperación | vuelven a verde | plana 1–3 min y luego retoma | Escalón en confirmadas; pendientes a 0 | Recuperación (s) se llena · Criterio E2 |

La espera del paso 7 es el backoff de rondas de QBFT (4·2^ronda s), no un fallo del tablero.

## Todas las métricas de `:9465/metrics`

| Métrica | Fuente | Descripción |
|---|---|---|
| `e2_fase` | guiado | Paso actual |
| `e2_nodo_estado{nodo}` | monitor | 0 ok · 1 DIVERGE · 2 CAÍDO |
| `e2_nodos_honestos` | monitor | Nodos que coinciden con la mayoría |
| `e2_nodos_en_desacuerdo` | monitor | Nodos divergentes |
| `e2_altura_comun` | monitor | Altura mínima entre los nodos vivos |
| `e2_segundos_sin_bloque` | monitor | Desde el último bloque nuevo |
| `e2_red_detenida` | monitor | 1 si > 8 s sin bloque |
| `e2_lotes_confirmados` / `e2_lotes_pendientes` | carga | Lotes (tx) |
| `e2_lotes_revertidos` / `e2_lotes_rechazados` | carga | Lotes con status 0 / no aceptados por el RPC |
| `e2_facturas_confirmadas` / `e2_facturas_pendientes` | carga | Facturas |
| `e2_facturas_por_segundo` | carga | Promedio móvil 10 s |
| `e2_facturas_por_ciclo` / `e2_lotes_por_ciclo` | carga | Configuración |
| `e2_ciclos_omitidos` | carga | Por tope de pendientes o ciclo anterior en curso |
| `e2_latencia_confirmacion_ms` | carga | Último lote confirmado |
| `e2_carga_encendida` | carga | 1 mientras corre |
| `e2_deteccion_ms` / `e2_deteccion_bloques` | guiado | Paso 3 |
| `e2_recuperacion_s` | guiado | Paso 7 |
| `e2_criterio_cumplido` | guiado | 1 si E2 cumple |

Para verlas en crudo: `Invoke-RestMethod http://localhost:9465/metrics`.
