$ErrorActionPreference = "Stop"

$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$rootDir = "C:\app"

$tasks = @(
  @{
    Name = "FactuDarwin Backend"
    Script = Join-Path $rootDir "scripts\start-backend-on-login.ps1"
    Schedule = "/SC ONLOGON"
    Description = "Levanta el backend de FactuDarwin al iniciar sesion en Windows."
  },
  @{
    Name = "FactuDarwin Backend Health Watch"
    Script = Join-Path $rootDir "scripts\run-backend-health-check.ps1"
    Schedule = "/SC MINUTE /MO 5"
    Description = "Verifica /health cada 5 minutos y solicita reinicio si el backend no responde."
  },
  @{
    Name = "FactuDarwin PostgreSQL Backup"
    Script = Join-Path $rootDir "scripts\run-postgres-backup.ps1"
    Schedule = "/SC DAILY /ST 23:30"
    Description = "Ejecuta backup PostgreSQL diario con prueba de restauracion."
  }
)

foreach ($task in $tasks) {
  if (-not (Test-Path -LiteralPath $task.Script)) {
    throw "No existe el script requerido: $($task.Script)"
  }

  $action = "`"$powerShell`" -NoProfile -ExecutionPolicy Bypass -File `"$($task.Script)`""
  schtasks.exe /Create /TN $task.Name /TR $action $($task.Schedule) /RL LIMITED /F | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo registrar la tarea: $($task.Name). Abra PowerShell como administrador."
  }

  Write-Host "Registrada: $($task.Name) - $($task.Description)"
}

Write-Host ""
Write-Host "Prueba manual:"
Write-Host "  schtasks /Run /TN `"FactuDarwin Backend`""
Write-Host "  schtasks /Run /TN `"FactuDarwin Backend Health Watch`""
Write-Host "  schtasks /Run /TN `"FactuDarwin PostgreSQL Backup`""
