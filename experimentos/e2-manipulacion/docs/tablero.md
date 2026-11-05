# E2 · Tablero de Grafana

[← Volver al README de E2](../README.md)

Grafana: http://localhost:3001 → **E2 · Manipulación del libro** (definido en `monitoring/grafana/tableros/e2-manipulacion.json`, acceso anónimo). Los datos vienen de dos jobs de Prometheus (`monitoring/prometheus.yml`): `besu` (métricas propias de cada nodo, cada 5 s) y `e2-experimento` (lo que publica `guiado.js` en `:9465`, cada 2 s). Sin `guiado.js` corriendo, los paneles `e2_*` quedan vacíos.

## Paneles

| Panel | Métrica | Qué muestra |
|---|---|---|
| Fase | `e2_fase` | Paso en curso (1–7; 8 = terminado) |
| Nodos activos (de 4) | `sum(up{job="besu"})` | Nodos que Prometheus alcanza |
| Nodos en desacuerdo | `e2_nodos_en_desacuerdo` | Nodos cuyo hash difiere de la mayoría |
| Estado de la red | `e2_red_detenida` | PRODUCIENDO / DETENIDA (más de 8 s sin bloque) |
| Criterio E2 | `e2_criterio_cumplido` | Veredicto final |
| Estado por nodo | `e2_nodo_estado{nodo}` | Franja por nodo: verde ok, naranja DIVERGE, rojo CAÍDO |
| Altura por nodo | `ethereum_blockchain_height` | Bloque de cada nodo; se congela sin quórum |
| Lotes de liquidación | `e2_lotes_confirmados`, `e2_lotes_pendientes` | Transacciones `registrarLote` |
| Latencia de confirmación | `e2_latencia_confirmacion_ms` | Envío → recibo del último lote confirmado |
| Detección (ms) / meta ≤ 1 bloque | `e2_deteccion_ms`, `e2_deteccion_bloques` | Medidas del paso 3 |
| Recuperación (s) | `e2_recuperacion_s` | Medida del paso 7 (−1 = no se recuperó) |
| Segundos sin bloque | `e2_segundos_sin_bloque` | Desde el último bloque nuevo |
| Facturas: confirmadas y pendientes | `e2_facturas_confirmadas`, `e2_facturas_pendientes` | La carga medida en facturas |
| Facturas confirmadas por segundo | `e2_facturas_por_segundo` | Promedio móvil de 10 s |
| Carga por ciclo | `e2_facturas_por_ciclo`, `e2_lotes_por_ciclo` | Configuración en uso (p. ej. 500 / 5) |
| Ciclos omitidos | `e2_ciclos_omitidos` | Ciclos no emitidos por el tope de 60 lotes pendientes |
| Lotes revertidos / rechazados | `e2_lotes_revertidos`, `e2_lotes_rechazados` | Deben quedarse en 0 |

## Qué esperar en cada paso (500 facturas cada 5 s)

| Paso | Estado por nodo | Altura | Facturas | Otros |
|---|---|---|---|---|
| 1 Red sana | 4 verdes | 4 líneas juntas | — | Desacuerdo 0 |
| 2 Carga | 4 verdes | sube | Confirmadas sube ~100/s; pendientes 0–500 | Latencia 2–4 s |
| 3 node4 miente | node4 naranja | sube | Sigue igual | Desacuerdo 1; detección 0–1 bloque |
| 4 Restaurar node4 | 4 verdes | sube | Sigue igual | Desacuerdo 0 |
| 5 Cae node4 | node4 rojo | 3 líneas suben | Sigue igual | Nodos activos 3 |
| 6 Caen node4 y node3 | 2 rojos | se congela | Confirmadas plana; pendientes sube (~2 500) | Red DETENIDA; segundos sin bloque crece |
| 7 Recuperación | vuelven a verde | retoma | Escalón en confirmadas; pendientes a 0 | Recuperación (s) se llena |

Con `-Facturas 1000` las cifras de facturas se duplican y, si la caída se alarga, aparecen ciclos omitidos.

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
