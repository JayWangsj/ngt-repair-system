param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [Parameter(Mandatory = $true)]
  [string]$ExpectedVersion
)
$ErrorActionPreference = "Stop"

if ($env:GITHUB_ACTIONS -ne "true" -or $env:RUNNER_ENVIRONMENT -ne "github-hosted") {
  throw "Installer acceptance is restricted to a disposable GitHub-hosted Windows runner."
}

$installerPath = [System.IO.Path]::GetFullPath($InstallerPath)
$checksumPath = "$installerPath.sha256"
if (-not (Test-Path -LiteralPath $installerPath -PathType Leaf) -or
    -not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
  throw "The Windows installer or its SHA256 file is missing."
}
$checksum = (Get-Content -LiteralPath $checksumPath -Raw).Trim()
if ($checksum -notmatch '^([A-Fa-f0-9]{64})\s+(.+)$' -or
    $Matches[2] -ne (Split-Path -Leaf $installerPath) -or
    (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash -ne $Matches[1]) {
  throw "The Windows installer checksum is invalid."
}

$installRoot = Join-Path $env:LOCALAPPDATA "NGT"
if (Test-Path -LiteralPath (Join-Path $installRoot ".local\studio.json")) {
  throw "The disposable runner already has an NGT Studio installation."
}
if (Get-ScheduledTask -TaskName "NGT Management System" -ErrorAction SilentlyContinue) {
  throw "The disposable runner already has an NGT startup task."
}
foreach ($port in @(3000, 55432)) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Installer acceptance port $port is already in use."
  }
}

$installationAttempted = $false
$cleanupSafe = $true
$installerLog = Join-Path $env:RUNNER_TEMP "installer.log"
try {
  $installationAttempted = $true
  $installer = Start-Process -FilePath $installerPath `
    -ArgumentList @("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/LOG=$installerLog") `
    -WindowStyle Hidden -Wait -PassThru
  if ($installer.ExitCode -ne 0) {
    throw "The Windows installer exited with code $($installer.ExitCode)."
  }

  $configurationPath = Join-Path $installRoot ".local\studio.json"
  if (-not (Test-Path -LiteralPath $configurationPath -PathType Leaf)) {
    throw "The installer did not write the stable Studio configuration."
  }
  $configuration = Get-Content -LiteralPath $configurationPath -Raw | ConvertFrom-Json
  $releaseRoot = [System.IO.Path]::GetFullPath([string]$configuration.activeRelease)
  $metadataPath = Join-Path $releaseRoot "studio-release.json"
  if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
    throw "The installer did not activate a complete Studio release."
  }
  $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
  if ([string]$metadata.version -ne $ExpectedVersion) {
    throw "Installed release version does not match the verified build artifact."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot "runtime\node.exe"))) {
    throw "The installed release is missing its verified Node runtime."
  }

  $health = $null
  for ($attempt = 0; $attempt -lt 180; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 5
      if ([string]$health.currentVersion -eq [string]$metadata.version) { break }
    } catch { }
    Start-Sleep -Seconds 1
  }
  if (-not $health -or [string]$health.currentVersion -ne [string]$metadata.version) {
    throw "The installed Studio did not report its active version as healthy."
  }
  $orders = Invoke-WebRequest -Uri "http://127.0.0.1:3000/orders" -UseBasicParsing -TimeoutSec 30
  if ($orders.StatusCode -ne 200) { throw "The installed Studio orders page did not load." }
  $updateInfo = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/system-update" `
    -Headers @{ Origin = "http://127.0.0.1:3000"; "Sec-Fetch-Site" = "same-origin" } -TimeoutSec 45
  if (-not $updateInfo.installed -or $updateInfo.currentVersion -ne [string]$metadata.version) {
    throw "The installed Studio update endpoint did not recognize the active version."
  }
  $stageLog = Join-Path $installRoot "install-stages.log"
  if (-not (Test-Path -LiteralPath $stageLog) -or
      -not (Select-String -LiteralPath $stageLog -Pattern "COMPLETE health-validation" -Quiet)) {
    throw "The installer did not complete its health-validation stage."
  }
  Write-Output "Windows installer acceptance passed for v$($metadata.version)."
} catch {
  try {
    & (Join-Path $PSScriptRoot "write-windows-studio-diagnostics.ps1") -Stage "installer-acceptance" -Tag ("v" + $ExpectedVersion) -Commit $env:GITHUB_SHA -Version $ExpectedVersion -Message $_.Exception.Message -SourcePaths @($installerLog)
  } catch {
    Write-Warning "Sanitized installer diagnostics could not be written."
  }
  throw
} finally {
  if ($installationAttempted) {
    $uninstaller = Join-Path $installRoot "uninstall\unins000.exe"
    if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
      try {
        $uninstallProcess = Start-Process -FilePath $uninstaller `
          -ArgumentList @("/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART") `
          -WindowStyle Hidden -Wait -PassThru
        if ($uninstallProcess.ExitCode -ne 0) {
          throw "The Windows installer acceptance uninstaller exited with code $($uninstallProcess.ExitCode)."
        }
      } catch {
        $cleanupSafe = $false
        Write-Warning ("Installer acceptance cleanup failed: " + $_.Exception.Message)
      }
    } elseif (Test-Path -LiteralPath (Join-Path $installRoot ".local\studio.json")) {
      $cleanupSafe = $false
      Write-Warning "Installer acceptance could not find its uninstaller; retained the isolated installation."
    }
  }
  if ($cleanupSafe) {
    foreach ($port in @(3000, 55432)) {
      if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        $cleanupSafe = $false
        Write-Warning "Installer acceptance left port $port open; no process was stopped by the test cleanup."
      }
    }
  }
  if (-not $cleanupSafe) { throw "Windows installer acceptance cleanup could not be verified." }
}
