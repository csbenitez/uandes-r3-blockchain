# E2 · Manipulación del libro

**Hipótesis:** reescribir un nodo no cambia la verdad del consorcio. Si se altera 1 de los 4 validadores, la red lo detecta en 1 bloque o menos, la mayoría sigue dando la huella correcta y la carga de facturas sigue confirmándose. El límite se mide con 2 de 4: la red se detiene en lugar de avanzar y se recupera cuando vuelven los nodos.

**Carga:** una carga constante de liquidaciones, por defecto **500 facturas cada 5 s**. Cada ciclo se parte en lotes de `MAX_LOTE` (100, lo fija el contrato), es decir 5 transacciones `registrarLote`. Con `-Facturas 1000` son 10 lotes por ciclo.

## Inicio rápido (PowerShell, desde la raíz del repo)

```powershell
npm install                                                           # una vez
.\experimentos\e2-manipulacion\e2.ps1 red -ReiniciarPrometheus        # 4 nodos + Prometheus + Grafana
.\experimentos\e2-manipulacion\e2.ps1 desplegar                       # contrato de facturas (una vez por red nueva)
.\experimentos\e2-manipulacion\e2.ps1 guiado                          # menú interactivo, 500 facturas cada 5 s
```

Abre Grafana en http://localhost:3001, tablero **E2 · Manipulación del libro** (acceso anónimo, sin login), y deja la terminal a su lado. Variantes frecuentes:

```powershell
.\experimentos\e2-manipulacion\e2.ps1 autopiloto -Facturas 1000 -Pausa 20  # los 7 pasos seguidos, 10 lotes por ciclo
.\experimentos\e2-manipulacion\e2.ps1 correr                               # conductor sin interfaz → resultados\resumen.json
.\experimentos\e2-manipulacion\e2.ps1 pruebas                              # pruebas de Node
.\experimentos\e2-manipulacion\e2.ps1 ayuda                                # todos los comandos y parámetros
```

## Criterio de éxito

| Escenario | Se espera |
|---|---|
| 1 de 4 manipulado (node4 miente) | Detección ≤ 1 bloque · `huellaDe` correcta en ≥ 3 nodos · la carga sigue confirmando |
| 1 de 4 caído | La red sigue produciendo bloques y confirmando lotes |
| 2 de 4 caídos | La red se detiene (no avanza la altura, no confirma lotes) y el backlog crece |
| Recuperación | Al volver los nodos, se confirman los lotes pendientes |

## Documentación

| Documento | Para qué |
|---|---|
| [Operación](docs/operacion.md) | Requisitos, comandos de `e2.ps1`, parámetros, menú, reinicio y problemas frecuentes |
| [Arquitectura del código](docs/arquitectura.md) | Cómo encajan los módulos, diagrama, funciones clave y cómo se decide quién miente |
| [Carga de facturas](docs/carga.md) | Ciclos, loteo por `MAX_LOTE`, gas, nonces, tope de pendientes y qué esperar con 500 y 1000 |
| [Tablero de Grafana](docs/tablero.md) | Cada panel con su métrica `e2_*` y qué valor esperar en cada paso |
| [Resultados y alcance](docs/resultados.md) | Fases y pasos, campos de `guiado.json` / `resumen.json`, qué simula y qué no |

## Archivos

| Ruta | Contenido |
|---|---|
| `e2.ps1` | Atajos de operación en PowerShell |
| `guiado.js` | Terminal interactiva: menú, modo guiado, autopiloto y acciones manuales |
| `correr.js` | Conductor automático de las fases 0, 1 y 2 |
| `enviar-facturas.js` | Emisor de facturas sintéticas (reutiliza el generador de E1); también usable solo |
| `src/carga.js` | Carga constante: ciclos de N facturas, seguimiento de recibos, métricas |
| `src/lotes.js` | Parte una ráfaga en lotes de `MAX_LOTE` |
| `src/observador.js` | Compara los hashes de los 4 nodos por su RPC; la verdad es la mayoría |
| `src/monitor.js` | Observación continua y métricas Prometheus en el puerto 9465 |
| `src/acciones.js` | Tumbar/levantar nodos y lecturas compartidas |
| `src/proxy-mentiroso.js` | Proxy delante de node4 que reescribe lo que ese nodo responde |
| `test/` | Pruebas de clasificación de nodos y de loteo |
| `resultados/` | Evidencia de las corridas (`guiado.json`, `resumen.json`) |
