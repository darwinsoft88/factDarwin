$ErrorActionPreference = "Stop"

$backendDir = "C:\app\backend"
$logsDir = Join-Path $backendDir "logs"
$port = 4000
$hostName = "127.0.0.1"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Test-PortOpen {
  param(
    [string] $HostName,
    [int] $Port
  )

  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $result = $client.BeginConnect($HostName, $Port, $null, $null)
    if (-not $result.AsyncWaitHandle.WaitOne(700, $false)) {
      return $false
    }
    $client.EndConnect($result)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

if (Test-PortOpen -HostName $hostName -Port $port) {
  Add-Content -Path (Join-Path $logsDir "backend-autostart.log") -Value "$(Get-Date -Format s) backend already running on port $port"
  exit 0
}

$env:NODE_ENV = "production"

Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList "start" `
  -WorkingDirectory $backendDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logsDir "backend-autostart.out.log") `
  -RedirectStandardError (Join-Path $logsDir "backend-autostart.err.log")

Add-Content -Path (Join-Path $logsDir "backend-autostart.log") -Value "$(Get-Date -Format s) backend start requested"
