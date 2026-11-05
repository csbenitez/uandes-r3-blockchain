<#
  Operación de E2 · Manipulación del libro (PowerShell).
  Uso:  .\experimentos\e2-manipulacion\e2.ps1 <comando> [-Facturas 500] [-Cada 5] [-Pausa 20] [-Ciclos 1] [-SinLimite] [-ReiniciarPrometheus]
    red          levanta los 4 nodos, Prometheus y Grafana (-ReiniciarPrometheus la primera vez)
    desplegar    despliega el contrato de facturas (escribe deployments\e1.json)
    guiado       terminal guiada: menú, paso a paso y acciones manuales
    autopiloto   los 7 pasos seguidos, con -Pausa segundos entre ellos
    correr       conductor automático sin interfaz (resultados\resumen.json; -SinLimite = solo fases 0 y 1)
    enviar       envía -Ciclos ráfagas de -Facturas facturas y espera sus recibos
    pruebas      pruebas de Node de E2
    estado       compara altura y hash de los 4 nodos durante unos segundos
    ayuda        muestra esta ayuda
  -Facturas  facturas por ciclo de la carga; se lotean en lotes de MAX_LOTE (100): 500 = 5 tx, 1000 = 10 tx
  -Cada      segundos entre ciclos de la carga constante
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('red', 'desplegar', 'guiado', 'autopiloto', 'correr', 'enviar', 'pruebas', 'estado', 'ayuda')]
  [string]$Cmd = 'ayuda',
  [ValidateRange(1, 100000)][int]$Facturas = 500,
  [ValidateRange(1, 3600)][int]$Cada = 5,
  [ValidateRange(0, 3600)][int]$Pausa = 20,
  [ValidateRange(1, 1000)][int]$Ciclos = 1,
  [switch]$SinLimite,
  [switch]$ReiniciarPrometheus
)
$ErrorActionPreference = 'Stop'
$Raiz = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $Raiz
$E2 = 'experimentos\e2-manipulacion'

function Titulo($t) { Write-Host "`n==> $t" -ForegroundColor Magenta }

function Requisitos {
  foreach ($c in 'node', 'docker') {
    if (-not (Get-Command $c -ErrorAction SilentlyContinue)) {
      throw "Falta '$c' en el PATH. Instala Node 20+ y Docker Desktop, y abre una PowerShell nueva."
    }
  }
  if (-not (Test-Path 'node_modules\ethers')) { throw "Faltan dependencias. Ejecuta 'npm install' en la raíz del repositorio." }
}

function Despliegue {
  if (-not (Test-Path 'deployments\e1.json')) { throw "No hay contrato desplegado. Ejecuta: .\$E2\e2.ps1 desplegar" }
}

if ($Cmd -eq 'ayuda') {
  (Get-Content $PSCommandPath -TotalCount 14 | Select-Object -Skip 1) -join "`n"
  return
}
Requisitos

switch ($Cmd) {
  'red' {
    Titulo 'Red QBFT de 4 validadores, Prometheus y Grafana'
    docker compose --profile monitoring up -d node1 node2 node3 node4 prometheus grafana
    if ($ReiniciarPrometheus) { docker compose --profile monitoring restart prometheus }
    'Grafana: http://localhost:3001  (tablero "E2 · Manipulación del libro")'
  }
  'desplegar' {
    Titulo 'Despliegue del contrato de facturas'
    Push-Location contracts-hardhat
    try { npx hardhat run scripts/deploy-e1.js --network besu } finally { Pop-Location }
  }
  'guiado' {
    Despliegue
    node "$E2\guiado.js" "--facturas=$Facturas" "--cada=$Cada"
  }
  'autopiloto' {
    Despliegue
    node "$E2\guiado.js" --autopiloto "--pausa=$Pausa" "--facturas=$Facturas" "--cada=$Cada"
  }
  'correr' {
    Despliegue
    $extra = @("--facturas=$Facturas")
    if ($SinLimite) { $extra += '--sin-limite' }
    node "$E2\correr.js" @extra
  }
  'enviar' {
    Despliegue
    node "$E2\enviar-facturas.js" $Facturas $Ciclos
  }
  'pruebas' {
    node --test --test-reporter=spec (Get-ChildItem "$E2\test\*.test.js").FullName
  }
  'estado' {
    # El observador corre en bucle; se toman sus primeras líneas y se corta.
    $p = Start-Process node -ArgumentList "$E2\src\observador.js" -NoNewWindow -PassThru
    Start-Sleep -Seconds 4
    Stop-Process -Id $p.Id -ErrorAction SilentlyContinue
  }
}
if ($LASTEXITCODE) { exit $LASTEXITCODE }
