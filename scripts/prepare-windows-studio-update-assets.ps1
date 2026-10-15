param(
  [string]$OutputDirectory = "dist",
  [string]$PackageDirectory = ".local\studio-package"
)
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
. (Join-Path $PSScriptRoot "studio-runtime.ps1")
$version = [string](Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json).version
$stage = if ([System.IO.Path]::IsPathRooted($PackageDirectory)) {
  [System.IO.Path]::GetFullPath($PackageDirectory)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $projectRoot $PackageDirectory))
}
$outputRoot = if ([System.IO.Path]::IsPathRooted($OutputDirectory)) {
  [System.IO.Path]::GetFullPath($OutputDirectory)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
}
$appArchive = Join-Path $outputRoot ("ngt-studio-windows-v" + $version + ".zip")
$runtimeArchive = Join-Path $outputRoot ("ngt-studio-runtime-v" + $version + ".zip")
if (-not (Test-Path -LiteralPath (Join-Path $stage "runtime\node.exe"))) {
  throw "Studio runtime is missing from the package directory."
}
if (-not (Test-Path -LiteralPath $appArchive)) {
  throw "Full studio package archive is missing: $appArchive"
}
$releaseMetadata = Get-Content -LiteralPath (Join-Path $stage "studio-release.json") -Raw | ConvertFrom-Json
$actualRuntimeHash = Get-NgtRuntimeHash (Join-Path $stage "runtime")
if ($actualRuntimeHash -ne [string]$releaseMetadata.runtimeHash) {
  throw "Studio runtime does not match the package metadata."
}

Remove-Item -LiteralPath $appArchive, ($appArchive + ".sha256"), $runtimeArchive, ($runtimeArchive + ".sha256") `
  -Force -ErrorAction SilentlyContinue
$applicationEntries = @(
  Get-ChildItem -LiteralPath $stage -Force |
    Where-Object { $_.Name -ne "runtime" } |
    ForEach-Object Name
)
Push-Location -LiteralPath $stage
try {
  & tar.exe -a -c -f $appArchive @applicationEntries
  if ($LASTEXITCODE -ne 0) { throw "Application update archive creation failed." }
  & tar.exe -a -c -f $runtimeArchive runtime
  if ($LASTEXITCODE -ne 0) { throw "Studio runtime archive creation failed." }
} finally {
  Pop-Location
}
foreach ($archive in @($appArchive, $runtimeArchive)) {
  $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
  Set-Content -LiteralPath ($archive + ".sha256") `
    -Value ("$hash  " + (Split-Path $archive -Leaf)) -Encoding ascii
}
$entries = & tar.exe -tf $appArchive
if ($LASTEXITCODE -ne 0) { throw "Application update archive verification failed." }
if ($entries | Where-Object { $_ -match "^(\./)?runtime(/|$)" }) {
  throw "Application update archive unexpectedly includes the runtime."
}
$requiredPrismaRuntimeEntry = ".next/standalone/node_modules/@prisma/client/runtime/library.js"
if (-not ($entries | Where-Object { $_ -like ("*" + $requiredPrismaRuntimeEntry) })) {
  throw "Application update archive is missing the Prisma client runtime."
}
Write-Output "Prepared application and reusable runtime release assets for v$version."
