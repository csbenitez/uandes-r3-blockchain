# E2 · Operación (PowerShell)

[← Volver al README de E2](../README.md)

Todo se ejecuta en **PowerShell 7+ desde la raíz del repositorio** (`D:\…\blockchain`). El script `e2.ps1` resuelve la raíz por su cuenta, así que también funciona si lo llamas con la ruta completa desde otra carpeta.

## Requisitos

| Requisito | Cómo comprobarlo |
|---|---|
| Node 20 o superior | `node --version` |
| Docker Desktop corriendo | `docker ps` |
| Dependencias del repo | `npm install` en la raíz (crea `node_modules\ethers`) |
| Red QBFT generada | La primera vez `.\taller.ps1 up` genera génesis y llaves; después basta `e2.ps1 red` |

`e2.ps1` comprueba `node`, `docker` y `node_modules\ethers` antes de cada comando y, en los comandos que envían transacciones, que exista `deployments\e1.json`.

> Si PowerShell bloquea el script ("la ejecución de scripts está deshabilitada"), habilítalo solo para la sesión actual: `Set-ExecutionPolicy -Scope Process Bypass`.

## Comandos de `e2.ps1`

| Comando | Qué hace | Equivalente directo |
|---|---|---|
| `red` | Levanta node1–node4, Prometheus (`:9090`) y Grafana (`:3001`) | `docker compose --profile monitoring up -d node1 node2 node3 node4 prometheus grafana` |
| `red -ReiniciarPrometheus` | Igual, y reinicia Prometheus para que cargue el job `e2-experimento` (solo la primera vez o si cambiaste `monitoring\prometheus.yml`) | `docker compose --profile monitoring restart prometheus` |
| `desplegar` | Despliega `RegistroFacturasMinimo` y escribe `deployments\e1.json` | `cd contracts-hardhat; npx hardhat run scripts/deploy-e1.js --network besu; cd ..` |
| `guiado` | Menú interactivo (modo guiado, autopiloto, acciones manuales) | `node experimentos\e2-manipulacion\guiado.js --facturas=500 --cada=5` |
| `autopiloto` | Los 7 pasos seguidos con `-Pausa` s entre ellos; sale con código 0 si E2 cumple | `node …\guiado.js --autopiloto --pausa=8 --facturas=500 --cada=5` |
| `correr` | Conductor sin interfaz ni Grafana (fases 0, 1 y 2, ~3–6 min) | `node …\correr.js --facturas=500` |
| `correr -SinLimite` | Solo fases 0 y 1 (~30 s): no detiene contenedores | `node …\correr.js --sin-limite` |
| `enviar` | Envía `-Ciclos` ráfagas de `-Facturas` facturas y espera los recibos | `node …\enviar-facturas.js 500 1` |
| `pruebas` | Pruebas de Node de E2 (`test\*.test.js`) | `node --test (Get-ChildItem experimentos\e2-manipulacion\test\*.test.js).FullName` |
| `estado` | Muestra ~4 s del observador: bloque común, hash y estado de cada nodo | `node …\src\observador.js` (Ctrl+C para salir) |
| `ayuda` | Lista comandos y parámetros | — |

## Parámetros

| Parámetro | Por defecto | Aplica a | Efecto |
|---|---|---|---|
| `-Facturas` | 500 | guiado, autopiloto, correr, enviar | Facturas por ciclo. Se parten en `ceil(N / 100)` lotes: 500 → 5 tx, 1000 → 10 tx, 250 → 3 tx (100, 100, 50) |
| `-Cada` | 5 | guiado, autopiloto | Segundos entre ciclos de la carga constante. 500 cada 5 s ≈ 100 facturas/s |
| `-Pausa` | 8 | autopiloto | Segundos entre pasos (para narrar en un video) |
| `-Ciclos` | 1 | enviar | Cuántas ráfagas manda `enviar` |
| `-SinLimite` | apagado | correr | Omite la fase 2 (caídas de nodos) |
| `-ReiniciarPrometheus` | apagado | red | Reinicia Prometheus tras levantarlo |

Ejemplos:

```powershell
.\experimentos\e2-manipulacion\e2.ps1 guiado -Facturas 1000            # 10 lotes cada 5 s ≈ 200 facturas/s
.\experimentos\e2-manipulacion\e2.ps1 guiado -Facturas 500 -Cada 2     # 5 lotes cada 2 s ≈ 250 facturas/s
.\experimentos\e2-manipulacion\e2.ps1 enviar -Facturas 500 -Ciclos 3   # prueba de humo: 15 lotes
.\experimentos\e2-manipulacion\e2.ps1 correr -Facturas 1000
```

## La terminal guiada

Al arrancar, `guiado.js` levanta el proxy de node4 (`:8585`), el monitor de métricas (`:9465`) y crea el emisor. Muestra la configuración de la carga y luego el menú:

| Opción | Qué hace |
|---|---|
| `1` Modo guiado | Recorre los 7 pasos. Antes de cada uno explica qué va a pasar y qué mirar en Grafana, y espera Enter (`s` vuelve al menú) |
| `2` Autopiloto | Los mismos 7 pasos sin esperar Enter |
| `3` Acciones manuales | Ver la tabla siguiente |
| `4` Estado | Una línea con nodos, altura y contadores de la carga |
| `q` | Sale y restaura todo |

Los 7 pasos: 1 red sana · 2 encender la carga · 3 node4 reescribe su libro · 4 restaurar node4 · 5 cae node4 · 6 cae también node3 · 7 recuperación. El detalle de cada uno está en [Resultados y alcance](resultados.md).

Acciones manuales (opción 3):

| Tecla | Acción |
|---|---|
| `a` / `b` | node4 empieza a mentir / vuelve a ser honesto |
| `c` / `d` | Detener / iniciar un contenedor (`node2`, `node3` o `node4`; node1 no se toca) |
| `e` | Encender o apagar la carga constante |
| `f` | Restaurar todo: node4 honesto, carga apagada, nodos detenidos vuelven a iniciar |
| `g` | Estado |
| `v` | Volver al menú |

**Salir con Ctrl+C o `q` siempre restaura**: apaga la carga, pone node4 honesto y vuelve a iniciar cualquier nodo detenido, aunque lo haya detenido otra corrida.

> **Una sola sesión a la vez.** `guiado.js`, `correr.js` y `enviar-facturas.js` firman con la misma cuenta (`DEPLOYER_PRIVATE_KEY` de `.env`) y llevan su propio contador de nonce. Dos procesos a la vez se pisan los nonces y sus transacciones quedan sin recibo. Cierra una sesión antes de abrir otra; con `Get-CimInstance Win32_Process -Filter "name='node.exe'" | Select ProcessId, CommandLine` ves cuáles siguen vivas.

## Reiniciar desde cero

```powershell
.\taller.ps1 reset                                     # borra cadena, llaves y despliegues de la red
Remove-Item deployments\e1.json -ErrorAction Ignore     # el contrato de E2 apunta a la red anterior
.\taller.ps1 up                                        # regenera génesis y levanta la red
.\experimentos\e2-manipulacion\e2.ps1 red -ReiniciarPrometheus
.\experimentos\e2-manipulacion\e2.ps1 desplegar
```

## Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El tablero de Grafana sale vacío ("No data") | Prometheus no tiene el job `e2-experimento` o `guiado.js` no está corriendo | `e2.ps1 red -ReiniciarPrometheus`; revisa http://localhost:9090/targets y que http://localhost:9465/metrics responda |
| `No hay contrato desplegado` | Falta `deployments\e1.json` | `e2.ps1 desplegar` |
| `La línea base no coincide` en el paso 1 / fase 0 | Algún nodo quedó en otra cadena o desincronizado | `e2.ps1 estado`; si persiste, reinicia desde cero |
| La carga queda en "pend" y nunca confirma | Otra sesión firma con la misma cuenta (nonces cruzados) o la red está detenida | Cierra la otra sesión; con `e2.ps1 estado` confirma que la altura sube |
| `Lotes rechazados` sube en Grafana | El RPC de node1 rechazó tx (nonce desfasado, txpool lleno) | El emisor se resincroniza solo; si sigue, baja `-Facturas` o sube `-Cada` |
| La recuperación tarda minutos | Normal en QBFT: tras perder quórum, las rondas tienen un tiempo de espera que crece hasta que los 3 nodos coinciden de nuevo | Espera; el límite es 6 min. `docker logs node3 --tail 20` muestra el avance |
| Un nodo no vuelve tras salir | El proceso se cortó antes de restaurar | `docker start node3 node4` |
| `ExecutionPolicy` bloquea `e2.ps1` | Política de PowerShell | `Set-ExecutionPolicy -Scope Process Bypass` |
