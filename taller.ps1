<#
  Atajos del taller.  Uso:  .\taller.ps1 <comando> [-Consensus qbft|ibft2] [-Tools] [-Monitoring]
    init     genera genesis + llaves (se hace solo en 'up' si no existen)
    up       levanta los 4 nodos (-Tools: + Remix, KMS, indexador, dApp; -Monitoring: + Prometheus/Grafana)
    deploy   compila y despliega los contratos (escribe deployments\besu.json)
    status   bloque, peers y validadores de cada nodo
    logs     logs de un servicio (-Service node1)
    down     detiene todo (conserva la cadena)
    reset    borra cadena, llaves y despliegues
#>
param(
  [Parameter(Position = 0)][ValidateSet('init', 'up', 'deploy', 'status', 'logs', 'down', 'reset')][string]$Cmd = 'status',
  [ValidateSet('qbft', 'ibft2')][string]$Consensus = 'qbft',
  [switch]$Tools,
  [switch]$Monitoring,
  [string]$Service = 'node1'
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$env:CONSENSUS = $Consensus
$profiles = @()
if ($Tools) { $profiles += '--profile', 'tools' }
if ($Monitoring) { $profiles += '--profile', 'monitoring' }

function Rpc($port, $method, $params = @()) {
  $body = @{ jsonrpc = '2.0'; id = 1; method = $method; params = $params } | ConvertTo-Json -Compress
  (Invoke-RestMethod -Uri "http://localhost:$port" -Method Post -Body $body -ContentType 'application/json').result
}

switch ($Cmd) {
  'init'   { docker compose run --rm besu-init }
  'up'     { docker compose @profiles up -d --build }
  'deploy' { Push-Location contracts-hardhat; try { npm install; npx hardhat compile; npx hardhat run scripts/deploy.js --network besu } finally { Pop-Location } }
  'status' {
    foreach ($p in 8545, 8555, 8565, 8575) {
      try {
        $bn = [Convert]::ToInt64((Rpc $p 'eth_blockNumber'), 16)
        $pc = [Convert]::ToInt64((Rpc $p 'net_peerCount'), 16)
        "{0}: bloque={1} peers={2}" -f $p, $bn, $pc
      } catch { "{0}: CAIDO" -f $p }
    }
    try { "validadores: " + ((Rpc 8545 ($(if ($Consensus -eq 'ibft2') { 'ibft_getValidatorsByBlockNumber' } else { 'qbft_getValidatorsByBlockNumber' })) @('latest')) -join ', ') } catch {}
  }
  'logs'   { docker compose logs -f --tail 50 $Service }
  'down'   { docker compose --profile tools --profile monitoring --profile e1 down }
  'reset'  {
    docker compose --profile tools --profile monitoring --profile e1 down -v
    Remove-Item -Recurse -Force network\out -ErrorAction SilentlyContinue
    Remove-Item -Force deployments\besu.json -ErrorAction SilentlyContinue
    'Reiniciado. Ejecuta: .\taller.ps1 up'
  }
}
