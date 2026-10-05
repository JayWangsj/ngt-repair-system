param(
  [Parameter(Mandatory = $true)]
  [string]$PackagePath,
  [Parameter(Mandatory = $true)]
  [string]$DataRoot,
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot,
  [Parameter(Mandatory = $true)]
  [string]$LogPath
)
$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Path (Split-Path -Parent $LogPath) -Force | Out-Null
Start-Transcript -LiteralPath $LogPath -Force
try {
  $releaseRoot = Split-Path -Parent $PackagePath
  Expand-Archive -LiteralPath $PackagePath -DestinationPath $releaseRoot -Force
  Remove-Item -LiteralPath $PackagePath -Force

  & (Join-Path $releaseRoot "scripts\install-windows-studio.ps1") `
    -DataRoot $DataRoot -InstallRoot $InstallRoot -InPlace
} catch {
  Write-Error $_
  exit 1
} finally {
  Stop-Transcript
}
