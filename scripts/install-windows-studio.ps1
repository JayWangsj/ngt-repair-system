param(
  [string]$DataRoot = (Join-Path $env:LOCALAPPDATA "NGT\data-store"),
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "NGT"),
  [switch]$InPlace
)
$ErrorActionPreference = "Stop"

$sourceRoot = Split-Path -Parent $PSScriptRoot
$releaseFile = Join-Path $sourceRoot "studio-release.json"
if ((Test-Path -LiteralPath $releaseFile) -and (-not $InPlace)) {
  $release = Get-Content -LiteralPath $releaseFile -Raw | ConvertFrom-Json
  $stableRoot = Join-Path ([System.IO.Path]::GetFullPath($InstallRoot)) ("releases\v" + $release.version)
  if ([System.IO.Path]::GetFullPath($sourceRoot) -ne [System.IO.Path]::GetFullPath($stableRoot)) {
    if (Test-Path -LiteralPath $stableRoot) {
      throw "Studio release is already installed: $stableRoot"
    }
    New-Item -ItemType Directory -Path $stableRoot -Force | Out-Null
    Get-ChildItem -LiteralPath $sourceRoot -Force | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination $stableRoot -Recurse -Force
    }
    & (Join-Path $stableRoot "scripts\install-windows-studio.ps1") `
      -DataRoot $DataRoot -InstallRoot $InstallRoot -InPlace
    return
  }
}

. (Join-Path $PSScriptRoot "windows-studio-common.ps1")
Set-Location -LiteralPath $script:NgtProjectRoot
$projectRoot = [System.IO.Path]::GetFullPath($script:NgtProjectRoot)
$stableDataRoot = [System.IO.Path]::GetFullPath($DataRoot)
$stableInstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
if ($stableDataRoot.StartsWith($projectRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Studio data must be stored outside the application release directory."
}

New-Item -ItemType Directory -Path $script:NgtStateDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $stableDataRoot -Force | Out-Null
@{
  dataRoot = $stableDataRoot
  installRoot = $stableInstallRoot
  repository = "JayWangsj/ngt-repair-system"
} | ConvertTo-Json | Set-Content `
  -LiteralPath (Join-Path $script:NgtStateDirectory "studio.json") -Encoding utf8
$env:NGT_DATA_ROOT = $stableDataRoot

$isRelease = Test-Path -LiteralPath (Join-Path $script:NgtProjectRoot "studio-release.json")
if ($isRelease) {
  $nodeExecutable = Get-NgtNodeExecutable
  $prismaCli = Join-Path $script:NgtProjectRoot "node_modules\prisma\build\index.js"
  if (-not (Test-Path -LiteralPath $prismaCli)) {
    throw "Studio release is missing the Prisma migration runtime."
  }
} else {
  Assert-NgtCommand "git"
  Assert-NgtCommand "node"
  Assert-NgtCommand "pnpm"
  $env:NODE_OPTIONS = "--max-old-space-size=1536"
  Invoke-NgtCommand "pnpm" @("install", "--frozen-lockfile")
}

Stop-NgtStudioProcesses
Start-NgtStudioDatabase
try {
  if ($isRelease) {
    Invoke-NgtCommand $nodeExecutable @($prismaCli, "migrate", "deploy")
  } else {
    Invoke-NgtCommand "pnpm" @("db:generate")
    Invoke-NgtCommand "pnpm" @("db:migrate")
    Invoke-NgtCommand "pnpm" @("build")
  }
} finally {
  Stop-NgtStudioProcesses
}

& (Join-Path $PSScriptRoot "install-windows-startup.ps1")
Wait-NgtStudioHealth
Write-Output "NGT studio installation is ready at http://127.0.0.1:3000"
