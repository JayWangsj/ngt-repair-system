param(
  [string]$Destination,
  [switch]$LeaveStopped
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows-studio-common.ps1")

Set-Location -LiteralPath $script:NgtProjectRoot
$config = Set-NgtStudioEnvironment
$task = Get-ScheduledTask -TaskName $script:NgtTaskName -ErrorAction SilentlyContinue
$restart = $task -and (-not $LeaveStopped)

Stop-NgtStudioProcesses
try {
  $dataRoot = [System.IO.Path]::GetFullPath([string]$config.dataRoot)
  $dataDirectory = Join-Path $dataRoot "data"
  if (-not (Test-Path -LiteralPath $dataDirectory)) {
    throw "Studio database does not exist: $dataDirectory"
  }
  if (-not $Destination) {
    $Destination = Join-Path $dataRoot "backups"
  }
  $backupRoot = Join-Path ([System.IO.Path]::GetFullPath($Destination)) (Get-Date -Format "yyyyMMdd-HHmmss")
  $databaseBackup = Join-Path $backupRoot "postgres-data"
  New-Item -ItemType Directory -Path $databaseBackup -Force | Out-Null
  Copy-Item -Path (Join-Path $dataDirectory "*") -Destination $databaseBackup -Recurse -Force

  $configBackup = Join-Path $backupRoot "config"
  New-Item -ItemType Directory -Path $configBackup -Force | Out-Null
  foreach ($file in @(
    (Join-Path $dataRoot "local-secrets.json"),
    (Join-Path $script:NgtProjectRoot ".env"),
    (Join-Path $script:NgtStateDirectory "studio.json")
  )) {
    if (Test-Path -LiteralPath $file) {
      Copy-Item -LiteralPath $file -Destination $configBackup -Force
    }
  }

  $backupPrefix = $backupRoot.TrimEnd("\") + "\"
  $manifest = Get-ChildItem -LiteralPath $backupRoot -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($backupPrefix.Length)
    $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    "$hash  $relative"
  }
  Set-Content -LiteralPath (Join-Path $backupRoot "SHA256SUMS.txt") -Value $manifest -Encoding utf8
  Write-Output "Studio backup created: $backupRoot"
} finally {
  if ($restart) {
    Start-NgtStudioTask
    Wait-NgtStudioHealth
  }
}
