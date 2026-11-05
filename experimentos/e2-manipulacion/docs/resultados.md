# E2 · Resultados y alcance

[← Volver al README de E2](../README.md)

## Pasos de la terminal guiada

| Paso | Acción | Medida | Criterio |
|---|---|---|---|
| 1 Red sana | Ancla un lote de referencia de 2 facturas y compara ese bloque en los 4 nodos | Nodos que coinciden | 4/4, si no, se aborta |
| 2 Carga | Enciende la carga constante (N facturas cada S s, en lotes de `MAX_LOTE`) | Facturas y lotes confirmados, latencia | — |
| 3 node4 miente | `proxy.mentir(true)`; observa hasta que `foto()` marca a node4; lee `huellaDe` de la factura de referencia en cada nodo; deja correr la carga 10 s | Detección (ms, bloques), nodos con la huella original, facturas confirmadas | ≤ 1 bloque · ≥ 3 nodos con la verdad · > 0 lotes confirmados |
| 4 Restaurar | `proxy.mentir(false)` | Nodos de acuerdo | 4/4 |
| 5 Cae 1 de 4 | `docker stop node4`; espera el siguiente bloque y 12 s de carga | Facturas y lotes confirmados | > 0 lotes |
| 6 Caen 2 de 4 | `docker stop node3`; 4 s de gracia y 21 s de observación | Altura antes/después, lotes confirmados, facturas pendientes | Altura sin cambios y 0 lotes confirmados tras la gracia |
| 7 Recuperación | `docker start node3 node4`; espera el primer lote confirmado (máx. 6 min) y 15 s más | Segundos hasta recuperar | Se recupera |

**Por qué la gracia de 4 s en el paso 6:** con varios lotes por ciclo, la ronda QBFT que ya tenía votos cuando cae node3 puede cerrar un último bloque con lotes adentro. Eso no es "seguir avanzando sin quórum", así que la detención se mide desde después de esa ronda.

E2 **cumple** si cumplen el paso 3, el 5 sigue, el 6 queda detenido y el 7 se recupera.

## Fases de `correr.js`

| Fase | Qué hace | Criterio |
|---|---|---|
| 0 | Ancla un lote de 2 facturas con los 4 nodos sanos | Los 4 hashes coinciden |
| 1 | node4 miente; mide detección y `huellaDe`; envía **una ráfaga de N facturas** y espera sus recibos | Detección ≤ 1 bloque · ≥ 3 nodos con la verdad · todos los lotes de la ráfaga confirmados |
| 2 | Detiene node4 y envía una ráfaga; detiene node3 y envía otra sin esperar; 20 s después compara; reinicia ambos | Con 1 caído confirma; con 2 caídos no avanza; todos los lotes colgados se confirman al recuperar |

## `resultados/guiado.json`

```jsonc
{
  "fecha": "2026-11-04T…Z",
  "base": { "bloque": 3809, "coinciden4": true },
  "manipulacion1de4": {
    "detectadoMs": 14,             // tiempo hasta que foto() marcó a node4
    "detectadoBloques": 0,         // bloques producidos entre la mentira y la detección
    "divergentes": ["node4"],
    "nodosConVerdad": ["node1", "node2", "node3"],
    "lotesConfirmados": 10,        // durante los 10 s con node4 mintiendo
    "facturasConfirmadas": 1000,
    "cumple": true
  },
  "conUnCaido": { "lotesConfirmados": 15, "facturasConfirmadas": 1500, "sigue": true },
  "conDosCaidos": {
    "alturaAntes": 3960, "alturaDespues": 3960,
    "lotesConfirmados": 0,
    "pendientes": 25,              // lotes sin recibo al final del paso
    "facturasPendientes": 2500,
    "redDetenida": true
  },
  "recuperacionS": 140,
  "carga": {
    "facturasPorCiclo": 500, "cadaS": 5, "maxLote": 100, "lotesPorCiclo": 5,
    "ciclos": 60, "ciclosOmitidos": 0,
    "lotesConfirmados": 300, "facturasConfirmadas": 30000,
    "lotesRevertidos": 0, "lotesRechazados": 0
  },
  "cumple": true
}
```

(Valores ilustrativos; los reales dependen de la máquina y de cuánto tarde QBFT en recuperarse.)

## `resultados/resumen.json` (de `correr.js`)

| Campo | Significado |
|---|---|
| `inicio`, `version` | Fecha y commit (`git rev-parse --short HEAD`) |
| `facturasPorRafaga`, `maxLote` | Configuración de la corrida |
| `fases.base` | Bloque de referencia y si coinciden los 4 |
| `fases.manipulacion1de4` | `detectadoMs`, `detectadoBloques`, `divergentes`, `nodosConVerdad`, `lotesEnviados`, `lotesConfirmados`, `facturasConfirmadas`, `cumple` |
| `fases.limite.conUnCaido` | Lotes confirmados y bloques en que entraron |
| `fases.limite.conDosCaidos` | Altura antes/después, `redDetenida`, `lotesColgados`, `lotesConfirmadosEnCaida` |
| `fases.limite.recuperacionMs`, `cumple` | Tiempo hasta confirmar todos los lotes colgados |

## Qué simula y qué no

- **Alterar node4** cambia lo que ese nodo *responde*; su Besu real sigue votando con honestidad. Besu no permite configurar un validador malicioso, y editar su base RocksDB produce un nodo que no arranca por checksum, no uno que miente.
- **Tumbar nodos** detiene contenedores reales. Para el quórum (3 de 4) un nodo caído y uno bizantino que no colabora pesan igual.
- Con 2 de 4 *colaborando* activamente, QBFT ya no garantiza seguridad; este experimento solo mide el caso sin colusión.
- `node1` no se puede tumbar desde la interfaz: es la entrada del emisor y del observador.
- La carga es sintética y entra por un solo nodo con una sola cuenta; sirve para ver el efecto de las fallas sobre una liquidación sostenida, no para medir la capacidad máxima de la red (ver [Carga de facturas](carga.md)).
