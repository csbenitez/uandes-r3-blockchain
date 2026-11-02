# E2 · Manipulación del libro

Hipótesis: reescribir un nodo no cambia la verdad del consorcio. Con 1 de 4 validadores alterado la detección toma ≤ 1 bloque y la red sigue con 3. Se mide el límite con 2 de 4.

## Para grabar (terminal guiada + Grafana)

```bash
bash experimentos/e2-manipulacion/e2.sh red          # nodos, Prometheus y Grafana
docker compose --profile monitoring restart prometheus   # solo la primera vez: carga el job e2-experimento
bash experimentos/e2-manipulacion/e2.sh desplegar    # contrato de facturas (una vez por red nueva)
bash experimentos/e2-manipulacion/e2.sh guiado       # menú interactivo
```

Abre Grafana en http://localhost:3001 → tablero **E2 · Manipulación del libro** (anónimo, sin login) y deja la terminal a su lado.

| Opción del menú | Qué hace |
|---|---|
| 1 · Modo guiado | 7 pasos; cada uno explica qué pasará y qué mirar en Grafana, y espera Enter |
| 2 · Autopiloto | Los mismos 7 pasos sin esperar (`PAUSA=8 bash …/e2.sh autopiloto` cambia la pausa) |
| 3 · Acciones manuales | Alterar/restaurar node4, tumbar/levantar node2-4, encender/apagar la carga |
| q | Sale y restaura: node4 honesto, carga apagada, nodos detenidos vuelven a iniciar |

Pasos: 1 red sana · 2 carga de liquidaciones · 3 node4 reescribe su libro · 4 restaurar · 5 cae 1 de 4 · 6 caen 2 de 4 · 7 recuperación. Al final imprime el veredicto y guarda `resultados/guiado.json`.

### Cómo leer el tablero
| Panel | Qué muestra |
|---|---|
| Fase | Paso en curso |
| Nodos activos / en desacuerdo / Estado de la red | Resumen inmediato; "DETENIDA" = más de 8 s sin bloque |
| Estado por nodo | Franja por nodo: verde ok, naranja DIVERGE (su hash difiere de la mayoría), rojo CAÍDO |
| Altura por nodo | Bloque de cada nodo; se congela al perder el quórum |
| Lotes confirmados y pendientes | La carga de liquidaciones: pendientes sube cuando no hay quórum |
| Detección (ms / bloques) y Recuperación (s) | Las medidas del experimento |

## Ejecución sin interfaz

```bash
node experimentos/e2-manipulacion/correr.js                # fases 0, 1 y 2 (~3 min)
node experimentos/e2-manipulacion/correr.js --sin-limite   # solo fases 0 y 1 (~20 s)
node experimentos/e2-manipulacion/src/observador.js        # vista en vivo de los 4 nodos
node experimentos/e2-manipulacion/enviar-facturas.js 10 2 1000   # 10 lotes de 2 facturas
bash experimentos/e2-manipulacion/e2.sh pruebas
```

| Fase de `correr.js` | Qué hace | Criterio |
|---|---|---|
| 0 | Ancla un lote con los 4 nodos sanos | Los 4 hashes coinciden |
| 1 | `node4` reescribe lo que cuenta de su libro (proxy `src/proxy-mentiroso.js`) | Detección ≤ 1 bloque; `huellaDe` correcta en ≥ 3 nodos; 3 lotes confirmados |
| 2 | Detiene `node4` y luego `node3` (`docker stop`) | Con 1 caído avanza; con 2 caídos se detiene; mide la recuperación |

## Qué simula y qué no

- **Alterar node4** cambia lo que ese nodo *responde*; su Besu real sigue votando con honestidad. Besu no permite configurar un validador malicioso, y editar su base RocksDB produce un nodo que no arranca por checksum, no uno que miente.
- **Tumbar nodos** detiene contenedores reales. Para el quórum (3 de 4) un nodo caído y uno bizantino que no colabora pesan igual.
- Con 2 de 4 *colaborando* activamente, QBFT ya no garantiza seguridad; este experimento solo mide el caso sin colusión.
- `node1` no se puede tumbar desde la interfaz: es la entrada del emisor y del observador.

## Archivos

| Ruta | Contenido |
|---|---|
| `guiado.js` | Terminal interactiva: menú, modo guiado, autopiloto y acciones manuales |
| `correr.js` | Conductor automático de las fases |
| `e2.sh` | Atajos de operación |
| `enviar-facturas.js` | Emisor de liquidaciones sintéticas (reutiliza el generador de E1) |
| `src/observador.js` | Compara hashes de los 4 nodos por su RPC; la verdad es la mayoría |
| `src/monitor.js` | Observación continua y métricas Prometheus en el puerto 9465 |
| `src/carga.js` | Carga continua de liquidaciones con seguimiento de recibos |
| `src/acciones.js` | Tumbar/levantar nodos y lecturas compartidas |
| `src/proxy-mentiroso.js` | Nodo que miente |
| `test/` | Pruebas de la clasificación de estados |
| `resultados/` | Evidencia de las corridas (`resumen.json`, `guiado.json`) |
