$ErrorActionPreference = "Stop"

$taskName = "FactuDarwin Backend"
$scriptPath = "C:\app\scripts\start-backend-on-login.ps1"
$powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$action = "`"$powerShell`" -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "No existe el script de arranque: $scriptPath"
}

schtasks.exe /Create /TN $taskName /TR $action /SC ONLOGON /RL LIMITED /F | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo registrar la tarea. Abra PowerShell como administrador y vuelva a ejecutar este script."
}

Write-Host "Tarea registrada: $taskName"
Write-Host "El backend se levantara automaticamente cuando este usuario inicie sesion en Windows."
Write-Host "Para probar ahora: schtasks /Run /TN `"$taskName`""
