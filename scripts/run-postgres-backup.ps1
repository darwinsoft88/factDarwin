$ErrorActionPreference = "Stop"

$rootDir = "C:\app"
$backendDir = "C:\app\backend"
$logsDir = Join-Path $backendDir "logs"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$outLog = Join-Path $logsDir "backup-postgres-$stamp.out.log"
$errLog = Join-Path $logsDir "backup-postgres-$stamp.err.log"

Push-Location $backendDir
try {
  $env:NODE_ENV = "production"
  $offsiteDir = [Environment]::GetEnvironmentVariable("FACTUDARWIN_OFFSITE_BACKUP_DIR", "User")
  if ([string]::IsNullOrWhiteSpace($offsiteDir)) {
    throw "FACTUDARWIN_OFFSITE_BACKUP_DIR no esta configurado para la copia externa."
  }
  $env:FACTUDARWIN_LOCAL_OFFSITE_DIR = $offsiteDir
  node (Join-Path $rootDir "scripts\run-backup-cycle.js") *>> $outLog
  if ($LASTEXITCODE -ne 0) {
    throw "La copia externa cifrada fallo. Revise $outLog y $errLog"
  }

  Add-Content -Path (Join-Path $logsDir "backup-postgres.log") -Value "$(Get-Date -Format s) backup PostgreSQL + activos + externo OK"
} catch {
  $_ | Out-File -FilePath $errLog -Encoding utf8
  Add-Content -Path (Join-Path $logsDir "backup-postgres.log") -Value "$(Get-Date -Format s) backup ERROR: $($_.Exception.Message)"
  exit 1
} finally {
  Pop-Location
}
