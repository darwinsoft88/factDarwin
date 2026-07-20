$ErrorActionPreference = "Stop"

$backendDir = "C:\app\backend"
$logsDir = Join-Path $backendDir "logs"
$healthUrl = "http://127.0.0.1:4000/health"
$taskName = "FactuDarwin Backend"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$logFile = Join-Path $logsDir "backend-health-watch.log"

function Write-WatchLog {
  param([string] $Message)
  Add-Content -Path $logFile -Value "$(Get-Date -Format s) $Message"
}

try {
  $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 8
  if ($response.StatusCode -eq 200 -and $response.Content -match '"ok"\s*:\s*true') {
    Write-WatchLog "OK $healthUrl"
    exit 0
  }

  Write-WatchLog "WARN health responded but not ok. Status=$($response.StatusCode)"
} catch {
  Write-WatchLog "ERROR health failed: $($_.Exception.Message)"
}

try {
  schtasks.exe /Run /TN $taskName | Out-Null
  Write-WatchLog "Restart requested through task: $taskName"
} catch {
  Write-WatchLog "ERROR restart failed: $($_.Exception.Message)"
  exit 1
}
