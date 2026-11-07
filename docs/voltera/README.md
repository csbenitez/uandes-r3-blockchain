# Voltera · Entrega 4 (ARTI-4208)

Facturación verificable: cada factura queda anclada en un libro compartido entre Voltera, el operador de red, el gestor de comunidades y el ente de control.

Este repositorio parte del taller de Besu. `docs/taller/` explica la base; esta carpeta documenta lo construido para el caso. Las definiciones están en [el cuaderno de la entrega](../Definitivo-ARTI4208-Proyecto-Entrega-4-v202601-Voltera.pdf).

## Estado por experimento

| Experimento | Rol | Estado | Dónde está |
|---|---|---|---|
| E1 · Manipulación off-chain | 1 | Cumple sobre Besu | [e1-integridad.md](e1-integridad.md) |
| E2 · Manipulación del libro | 2 | Implementado: conductor, terminal guiada, carga constante loteada y tablero de Grafana; falta la corrida oficial | [README](../../experimentos/e2-manipulacion/README.md) |
| E3 · Latencia no bloqueante | 3 | Pendiente | |
| E4 · Autorización | 4 | Pendiente; base en [limitaciones-e4.md](limitaciones-e4.md) | |
| E5 · Capacidad de anclaje | 5 | Pendiente | |

## Qué leer según lo que necesites

| Necesito | Documento |
|---|---|
| Correr E1 o entender sus fases | [e1-integridad.md](e1-integridad.md) |
| Correr E2 (PowerShell) o entender su código | [README de E2](../../experimentos/e2-manipulacion/README.md) y su carpeta [docs](../../experimentos/e2-manipulacion/docs/operacion.md) |
| Calcular o validar una huella | [especificacion-huella.md](especificacion-huella.md) |
| Usar contratos, API, métricas o generador | [consumo-por-roles.md](consumo-por-roles.md) |
| Saber qué falta del rol 4 | [limitaciones-e4.md](limitaciones-e4.md) |

## Dónde vive cada cosa

| Carpeta | Contenido de Voltera |
|---|---|
| `contracts-hardhat/contracts/` | `IRegistroFacturas.sol`, `RegistroFacturasMinimo.sol` |
| `contracts-hardhat/test/` | `RegistroFacturas.conformidad.test.js` |
| `contracts-hardhat/scripts/` | `deploy-e1.js` |
| `services/cmd/invoice-verifier/` | Microservicio de verificación |
| `services/internal/` | `huella`, `almacen`, `verificacion` |
| `experimentos/e1-integridad/` | Script, conductor, generador, vectores y resultados |
| `experimentos/e2-manipulacion/` | `e2.ps1`, terminal guiada, conductor, carga, observador, proxy, documentación y resultados |
| `monitoring/grafana/` | Fuente de datos y tableros de E1 y E2 |

## Convenciones para continuar

- Cada experimento vive en `experimentos/eN-<tema>/`, con un script de operación (`e1.sh` en E1; `e2.ps1` en PowerShell desde E2) y sus evidencias en `resultados/`.
- Cada experimento se documenta en `docs/voltera/eN-<tema>.md` o, desde E2, en el README y la carpeta `docs/` del propio experimento.
- Los servicios siguen el patrón del repo: `services/cmd/<nombre>` y un perfil en `docker-compose.yml`.
- Cada despliegue escribe su propio `deployments/eN.json`; `besu.json` sigue siendo del taller.
- El nombre de un servicio es el de las láminas, por ejemplo `settlement-ledger`.
