param(
  [Parameter(Mandatory = $true)]
  [string]$PackagePath,
  [Parameter(Mandatory = $true)]
  [string]$DataRoot,
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot
)
$ErrorActionPreference = "Stop"

$releaseRoot = Split-Path -Parent $PackagePath
Expand-Archive -LiteralPath $PackagePath -DestinationPath $releaseRoot -Force
Remove-Item -LiteralPath $PackagePath -Force

& (Join-Path $releaseRoot "scripts\install-windows-studio.ps1") `
  -DataRoot $DataRoot -InstallRoot $InstallRoot -InPlace
if ($LASTEXITCODE -ne 0) {
  throw "Windows studio initialization failed with exit code $LASTEXITCODE."
}
