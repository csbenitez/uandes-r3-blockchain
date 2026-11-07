# E2 · Carga de facturas

[← Volver al README de E2](../README.md)

## Por qué una carga constante

Una red que confirma bien un lote aislado puede comportarse distinto con tráfico sostenido. E2 mide si la manipulación de un nodo o la caída de uno afectan a la liquidación real de Voltera, así que mientras se provocan las fallas corre una **carga constante de N facturas por ciclo** (10 por defecto) contra node1.

## De facturas a transacciones

```
ciclo (cada -Cada s)
 └─ generar N facturas sintéticas             (generador de E1)
     └─ lotear(facturas, MAX_LOTE)            (src/lotes.js)
         ├─ lote 1: facturas    1–100  → tx registrarLote, nonce k
         ├─ lote 2: facturas  101–200  → tx registrarLote, nonce k+1
         ├─ …
         └─ lote ⌈N/100⌉                → tx registrarLote, nonce k+⌈N/100⌉−1
```

| Facturas por ciclo | Lotes (tx) por ciclo | Gas máx. por lote | A `-Cada 5` |
|---|---|---|---|
| 10 (por defecto) | 1 | 0,45 M | ~2 facturas/s |
| 250 | 3 (100, 100, 50) | 3,6 M | ~50 facturas/s |
| 500 | 5 | 3,6 M | ~100 facturas/s |
| 1000 | 10 | 3,6 M | ~200 facturas/s |

- **`MAX_LOTE`** lo fija el contrato (`RegistroFacturasMinimo.MAX_LOTE = 100`). El emisor lo lee al arrancar (`registro.MAX_LOTE()`), así que si el contrato cambia el tope, la carga se adapta sin tocar código.
- **Gas por lote:** `100 000 + 35 000 × facturas`. Un lote de 100 pide 3,6 M de gas. El génesis tiene un `gasLimit` de bloque prácticamente ilimitado, así que varios lotes caben en el mismo bloque.
- **Sin esperar bloque:** los lotes de un ciclo salen uno tras otro con nonces consecutivos. Besu los acepta en su txpool y los incluye en el siguiente bloque (cada 2 s).

## Ciclo de vida de un lote

```
enviado ──(recibo status 1)──▶ confirmado   → suma a lotes/facturas confirmadas
   │     ──(recibo status 0)──▶ revertido    → e2_lotes_revertidos
   └── RPC lo rechaza ───────▶ rechazado    → e2_lotes_rechazados (no queda pendiente)
```

`Carga.revisar()` corre cada segundo y pide en paralelo el recibo de todos los lotes pendientes. La **latencia** publicada es la del último lote confirmado (envío → recibo visto). **Facturas/s** es un promedio móvil de 10 s de las facturas confirmadas.

## Tope de pendientes y ciclos omitidos

Si la red pierde el quórum, nada se confirma y los lotes se acumulan. Para no inundar el txpool de Besu, la carga tiene un tope de **60 lotes pendientes** (`MAX_PENDIENTES` en `src/carga.js`): si el siguiente ciclo no cabe, no se emite y se cuenta como **ciclo omitido**. También se omite un ciclo si el anterior aún se está enviando (posible con N grande y `-Cada` corto).

Con 2 de 4 caídos durante el paso 6 (~25 s):

| Configuración | Lotes por ciclo | Ciclos que caben bajo el tope | Backlog máximo |
|---|---|---|---|
| 500 cada 5 s | 5 | 12 (≈ 60 s) | ~25 lotes / 2 500 facturas en 25 s, sin omitir |
| 1000 cada 5 s | 10 | 6 (≈ 30 s) | ~50 lotes / 5 000 facturas en 25 s; durante la recuperación empiezan a omitirse ciclos |

Al recuperar el quórum, Besu incluye el backlog en los primeros bloques: en Grafana se ve un escalón en "Facturas confirmadas" y "Facturas pendientes" cae a 0.

## Uso independiente

```powershell
.\experimentos\e2-manipulacion\e2.ps1 enviar -Facturas 500 -Ciclos 3
```

Imprime una línea por lote (cantidad, rango de ids, hash de la tx, bloque, estado) y un total por ciclo. Sirve como prueba de humo tras desplegar el contrato.

## Limitaciones

- **Una sola cuenta firmante.** El nonce se lleva en memoria; dos procesos con la misma llave se pisan. Una sesión a la vez (ver [Operación](operacion.md)).
- **Un solo punto de entrada.** Todo entra por node1; no se reparte la carga entre nodos.
- **Facturas sintéticas.** El contenido viene del generador de E1; lo que se ancla (huella, cuenta seudónima, periodo, Wh, COP) tiene el mismo formato que en producción.
- **Throughput no es el objetivo de E2.** Los números de facturas/s describen la carga del experimento, no la capacidad máxima de la red.
