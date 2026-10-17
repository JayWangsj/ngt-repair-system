param(
  [string]$DataRoot = (Join-Path $env:LOCALAPPDATA "NGT\data-store"),
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "NGT"),
  [string]$PreviousReleaseRoot,
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
$previousActiveRelease = $PreviousReleaseRoot
$existingStableConfig = Join-Path $stableStateDirectory "studio.json"
if (Test-Path -LiteralPath $existingStableConfig) {
  if (-not $previousActiveRelease) {
    $previousActiveRelease = [string](Get-Content -LiteralPath $existingStableConfig -Raw | ConvertFrom-Json).activeRelease
  }
  $sourceStateDirectory = $script:NgtStateDirectory
  $script:NgtStateDirectory = $stableStateDirectory
  try {
    Stop-NgtStudioProcesses
  } finally {
    $script:NgtStateDirectory = $sourceStateDirectory
  }
}
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
$previousActiveRelease = if ($PreviousReleaseRoot) { $PreviousReleaseRoot } else { $previousActiveRelease }
$studioConfig = [pscustomobject]@{
  dataRoot = $stableDataRoot
  installRoot = $stableInstallRoot
  activeRelease = $projectRoot
  repository = "JayWangsj/ngt1"
}
Set-NgtStudioConfig `
  -Path (Join-Path $script:NgtStateDirectory "studio.json") `
  -Configuration $studioConfig
Set-NgtStudioConfig `
  -Path (Join-Path $stableStateDirectory "studio.json") `
  -Configuration $studioConfig
$env:NGT_DATA_ROOT = $stableDataRoot

$isRelease = Test-Path -LiteralPath (Join-Path $script:NgtProjectRoot "studio-release.json")
if ($isRelease) {
  & (Join-Path $PSScriptRoot "verify-windows-studio-release.ps1") `
    -ReleaseRoot $script:NgtProjectRoot `
    -ExpectedVersion ([string](Get-Content -LiteralPath (Join-Path $script:NgtProjectRoot "studio-release.json") -Raw | ConvertFrom-Json).version) | Out-Null
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
  & (Join-Path $PSScriptRoot "install-windows-startup.ps1") -InstallRoot $stableInstallRoot
}
Invoke-NgtInstallStage "health-validation" {
  Wait-NgtStudioHealth
}
try {
  & (Join-Path $PSScriptRoot "retain-windows-studio-releases.ps1") `
    -InstallRoot $stableInstallRoot `
    -CurrentReleaseRoot $projectRoot `
    -TargetReleaseRoot $projectRoot `
    -PreviousReleaseRoot $previousActiveRelease
  Remove-NgtUnusedRuntimes -InstallRoot $stableInstallRoot
} catch {
  $cleanupWarning = "The studio is healthy, but old release cleanup needs retry: " + $_.Exception.Message
  Write-Warning $cleanupWarning
  Add-Content -LiteralPath (Join-Path $env:LOCALAPPDATA "NGT\install-stages.log") `
    -Value ("{0:o} WARNING post-install-cleanup reason={1}" -f (Get-Date).ToUniversalTime(), $cleanupWarning)
}
Write-Output "NGT studio installation is ready at http://127.0.0.1:3000"
