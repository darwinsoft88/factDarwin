$ErrorActionPreference = "Stop"

$logsDir = "C:\app\backend\logs"
$tunnelName = $env:FACTUDARWIN_TUNNEL_NAME

if (-not $tunnelName) {
  $tunnelName = "FactuDarwin-API"
}

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$cloudflaredCommand = Get-Command "cloudflared.exe" -ErrorAction SilentlyContinue
$cloudflared = $null
if ($cloudflaredCommand) {
  $cloudflared = $cloudflaredCommand.Source
}
if (-not $cloudflared) {
  $defaultPath = "C:\Program Files\cloudflared\cloudflared.exe"
  if (Test-Path -LiteralPath $defaultPath) {
    $cloudflared = $defaultPath
  }
}

if (-not $cloudflared) {
  throw "No se encontro cloudflared.exe. Instale Cloudflare Tunnel o agregue cloudflared al PATH."
}

Start-Process `
  -FilePath $cloudflared `
  -ArgumentList "tunnel run $tunnelName" `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logsDir "cloudflared.out.log") `
  -RedirectStandardError (Join-Path $logsDir "cloudflared.err.log")

Add-Content -Path (Join-Path $logsDir "cloudflared-autostart.log") -Value "$(Get-Date -Format s) tunnel start requested: $tunnelName"
