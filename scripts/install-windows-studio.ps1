param(
  [string]$DataRoot = (Join-Path $env:LOCALAPPDATA "NGT\data-store"),
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "NGT"),
  [switch]$InPlace
)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "studio-runtime.ps1")

function Invoke-NgtInstallStage([string]$Name, [scriptblock]$Action) {
  $logPath = Join-Path $env:LOCALAPPDATA "NGT\install-stages.log"
  New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
  $startedAt = Get-Date
  Add-Content -LiteralPath $logPath -Value ("{0:o} START {1}" -f $startedAt.ToUniversalTime(), $Name)
  try {
    & $Action
    $elapsed = [Math]::Round(((Get-Date) - $startedAt).TotalSeconds, 2)
    Add-Content -LiteralPath $logPath -Value ("{0:o} COMPLETE {1} durationSeconds={2}" -f (Get-Date).ToUniversalTime(), $Name, $elapsed)
  } catch {
    $elapsed = [Math]::Round(((Get-Date) - $startedAt).TotalSeconds, 2)
    Add-Content -LiteralPath $logPath -Value ("{0:o} FAILED {1} durationSeconds={2} reason={3}" -f (Get-Date).ToUniversalTime(), $Name, $elapsed, $_.Exception.Message)
    throw
  }
}

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
$stableServiceDirectory = Join-Path $stableInstallRoot "service"
$stableAssetDirectory = Join-Path $stableInstallRoot "assets"
$stableStateDirectory = Join-Path $stableInstallRoot ".local"
New-Item -ItemType Directory -Path $stableServiceDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $stableAssetDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $stableStateDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $script:NgtProjectRoot "scripts\windows-service.ps1") `
  -Destination $stableServiceDirectory -Force
Copy-Item -LiteralPath (Join-Path $script:NgtProjectRoot "scripts\windows-studio-common.ps1") `
  -Destination $stableServiceDirectory -Force
Copy-Item -LiteralPath (Join-Path $script:NgtProjectRoot "scripts\windows-studio-launcher.vbs") `
  -Destination $stableServiceDirectory -Force
Copy-Item -LiteralPath (Join-Path $script:NgtProjectRoot "scripts\uninstall-windows-studio.ps1") `
  -Destination $stableServiceDirectory -Force
Copy-Item -LiteralPath (Join-Path $script:NgtProjectRoot "scripts\uninstall-windows-startup.ps1") `
  -Destination $stableServiceDirectory -Force
Copy-Item -LiteralPath (Join-Path $script:NgtProjectRoot "assets\ngt-studio.ico") `
  -Destination $stableAssetDirectory -Force
@{
  dataRoot = $stableDataRoot
  installRoot = $stableInstallRoot
  activeRelease = $projectRoot
  repository = "JayWangsj/ngt-repair-system"
} | ConvertTo-Json | Set-Content `
  -LiteralPath (Join-Path $script:NgtStateDirectory "studio.json") -Encoding utf8
Copy-Item -LiteralPath (Join-Path $script:NgtStateDirectory "studio.json") `
  -Destination (Join-Path $stableStateDirectory "studio.json") -Force
$env:NGT_DATA_ROOT = $stableDataRoot

$isRelease = Test-Path -LiteralPath (Join-Path $script:NgtProjectRoot "studio-release.json")
if ($isRelease) {
  Install-NgtSharedRuntime -ProjectRoot $script:NgtProjectRoot -InstallRoot $stableInstallRoot
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

Invoke-NgtInstallStage "database" {
  Stop-NgtStudioProcesses
  Start-NgtStudioDatabase
}
Invoke-NgtInstallStage "migrations" {
  if ($isRelease) {
    Invoke-NgtCommand $nodeExecutable @($prismaCli, "migrate", "deploy")
  } else {
    Invoke-NgtCommand "pnpm" @("db:generate")
    Invoke-NgtCommand "pnpm" @("db:migrate")
    Invoke-NgtCommand "pnpm" @("build")
  }
  Stop-NgtStudioProcesses
}
Invoke-NgtInstallStage "application-start" {
  & (Join-Path $PSScriptRoot "install-windows-startup.ps1")
}
Invoke-NgtInstallStage "health-validation" {
  Wait-NgtStudioHealth
}
$releaseDirectories = @(Get-ChildItem -LiteralPath (Join-Path $stableInstallRoot "releases") -Directory -ErrorAction SilentlyContinue |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "studio-release.json") } |
  Sort-Object { [version]((Get-Content -LiteralPath (Join-Path $_.FullName "studio-release.json") -Raw | ConvertFrom-Json).version) } -Descending)
foreach ($oldRelease in @($releaseDirectories | Select-Object -Skip 2)) {
  Remove-Item -LiteralPath $oldRelease.FullName -Recurse -Force
}
Remove-NgtUnusedRuntimes -InstallRoot $stableInstallRoot
Write-Output "NGT studio installation is ready at http://127.0.0.1:3000"
