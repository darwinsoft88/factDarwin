$ErrorActionPreference = "Stop"

$backendDir = "C:\app\backend"
$logsDir = Join-Path $backendDir "logs"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$outLog = Join-Path $logsDir "backup-postgres-$stamp.out.log"
$errLog = Join-Path $logsDir "backup-postgres-$stamp.err.log"

Push-Location $backendDir
try {
  $env:NODE_ENV = "production"
  npm.cmd run backup:postgres *> $outLog
  if ($LASTEXITCODE -ne 0) {
    throw "backup:postgres fallo. Revise $outLog y $errLog"
  }

  Add-Content -Path (Join-Path $logsDir "backup-postgres.log") -Value "$(Get-Date -Format s) backup OK"
} catch {
  $_ | Out-File -FilePath $errLog -Encoding utf8
  Add-Content -Path (Join-Path $logsDir "backup-postgres.log") -Value "$(Get-Date -Format s) backup ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  Pop-Location
}
