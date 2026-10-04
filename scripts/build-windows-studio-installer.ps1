param(
  [string]$SourceDirectory = ".local\studio-package",
  [string]$OutputDirectory = "dist",
  [string]$CompilerPath
)
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$package = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
$version = [string]$package.version
$sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $SourceDirectory))
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
$installerDefinition = Join-Path $projectRoot "installer\windows-studio.iss"

if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot "studio-release.json"))) {
  throw "Studio package is missing. Run scripts/build-windows-studio-package.ps1 first."
}
if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot "assets\ngt-studio.ico"))) {
  throw "Studio package icon is missing: $sourceRoot\assets\ngt-studio.ico"
}
if (-not (Test-Path -LiteralPath $installerDefinition)) {
  throw "Installer definition is missing: $installerDefinition"
}

if (-not $CompilerPath) {
  $compilerCandidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
  )
  $CompilerPath = $compilerCandidates | Where-Object {
    Test-Path -LiteralPath $_
  } | Select-Object -First 1
  if (-not $CompilerPath) {
    $compiler = Get-Command "iscc.exe" -ErrorAction SilentlyContinue
    if ($compiler) {
      $CompilerPath = $compiler.Source
    }
  }
}
if ((-not $CompilerPath) -or (-not (Test-Path -LiteralPath $CompilerPath))) {
  throw "Inno Setup compiler was not found: $CompilerPath"
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
Write-Output "Inno Setup compiler: $CompilerPath"
Write-Output "Installer source: $sourceRoot"
Write-Output "Installer output: $outputRoot"
& $CompilerPath `
  ("/DAppVersion=" + $version) `
  ("/DSourceDir=" + $sourceRoot) `
  ("/DOutputDir=" + $outputRoot) `
  $installerDefinition
if ($LASTEXITCODE -ne 0) {
  throw "Windows studio installer compilation failed."
}

$installer = Join-Path $outputRoot ("ngt-studio-windows-setup-v" + $version + ".exe")
if (-not (Test-Path -LiteralPath $installer)) {
  throw "Windows studio installer was not created."
}
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
Set-Content -LiteralPath ($installer + ".sha256") `
  -Value ("$hash  " + (Split-Path $installer -Leaf)) -Encoding ascii
Write-Output $installer
