$ErrorActionPreference = "Stop"

$backendDir = "C:\app\backend"
$sourceDir = Join-Path $backendDir "uploads\companies"
$backupDir = Join-Path $backendDir "backups\tenant-assets"
$retentionDays = 30

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$backupRoot = [System.IO.Path]::GetFullPath($backupDir).TrimEnd('\') + '\'
$stamp = Get-Date -Format "yyyyMMddHHmmss"
$archivePath = Join-Path $backupDir "tenant-assets-$stamp.zip"
$temporaryPath = "$archivePath.tmp"
$manifestPath = "$archivePath.manifest.json"

if (-not (Test-Path -LiteralPath $sourceDir)) {
  throw "No existe la carpeta de activos por empresa: $sourceDir"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-StreamSha256 {
  param([System.IO.Stream] $Stream)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($Stream))).Replace("-", "")
  } finally {
    $sha.Dispose()
  }
}

try {
  $sourceRoot = [System.IO.Path]::GetFullPath($sourceDir).TrimEnd('\') + '\'
  $files = @(Get-ChildItem -LiteralPath $sourceDir -File -Recurse | Sort-Object FullName)
  $expected = @{}

  $fileStream = [System.IO.File]::Open($temporaryPath, [System.IO.FileMode]::CreateNew)
  try {
    $zip = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
      foreach ($file in $files) {
        $fullPath = [System.IO.Path]::GetFullPath($file.FullName)
        if (-not $fullPath.StartsWith($sourceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
          throw "Activo fuera de la carpeta autorizada: $fullPath"
        }
        $relativePath = $fullPath.Substring($sourceRoot.Length).Replace('\', '/')
        $entry = $zip.CreateEntry("companies/$relativePath", [System.IO.Compression.CompressionLevel]::Optimal)
        $input = [System.IO.File]::OpenRead($fullPath)
        try {
          $expected[$entry.FullName] = Get-StreamSha256 -Stream $input
          $input.Position = 0
          $output = $entry.Open()
          try { $input.CopyTo($output) } finally { $output.Dispose() }
        } finally {
          $input.Dispose()
        }
      }
    } finally {
      $zip.Dispose()
    }
  } finally {
    $fileStream.Dispose()
  }

  $verified = @{}
  $readZip = [System.IO.Compression.ZipFile]::OpenRead($temporaryPath)
  try {
    foreach ($entry in $readZip.Entries) {
      $stream = $entry.Open()
      try { $verified[$entry.FullName] = Get-StreamSha256 -Stream $stream } finally { $stream.Dispose() }
    }
  } finally {
    $readZip.Dispose()
  }

  if ($expected.Count -ne $verified.Count) {
    throw "El ZIP verificado no contiene la misma cantidad de archivos."
  }
  foreach ($name in $expected.Keys) {
    if ($verified[$name] -ne $expected[$name]) {
      throw "El ZIP no supero la verificacion SHA-256 para $name"
    }
  }

  Move-Item -LiteralPath $temporaryPath -Destination $archivePath
  $archive = Get-Item -LiteralPath $archivePath
  $manifest = [ordered]@{
    format = "factudarwin-tenant-assets-backup-v1"
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    archive = $archive.Name
    archiveSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
    sizeBytes = $archive.Length
    fileCount = $expected.Count
    files = @($expected.Keys | Sort-Object | ForEach-Object { [ordered]@{ path = $_; sha256 = $expected[$_] } })
    note = "ASSET_ENCRYPTION_SECRET no se incluye; debe custodiarse separadamente."
  }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  $cutoff = (Get-Date).AddDays(-$retentionDays)
  Get-ChildItem -LiteralPath $backupDir -File | Where-Object {
    $_.LastWriteTime -lt $cutoff -and ($_.Name -like "tenant-assets-*.zip" -or $_.Name -like "tenant-assets-*.zip.manifest.json")
  } | ForEach-Object {
    $candidate = [System.IO.Path]::GetFullPath($_.FullName)
    if ($candidate.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $candidate -Force
    }
  }

  Write-Output "Backup de activos OK: $archivePath"
  Write-Output "Archivos verificados: $($expected.Count)"
  Write-Output "SHA256: $($manifest.archiveSha256)"
} catch {
  if (Test-Path -LiteralPath $temporaryPath) {
    $candidate = [System.IO.Path]::GetFullPath($temporaryPath)
    if ($candidate.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $candidate -Force
    }
  }
  throw
}
