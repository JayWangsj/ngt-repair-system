$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows-studio-common.ps1")

Set-Location -LiteralPath $script:NgtProjectRoot
$config = Set-NgtStudioEnvironment
$githubCli = Get-NgtGitHubCli
$releaseFile = Join-Path $script:NgtProjectRoot "studio-release.json"
if (-not (Test-Path -LiteralPath $releaseFile)) {
  throw "One-click studio updates require an installed Windows studio release."
}
$currentRelease = Get-Content -LiteralPath $releaseFile -Raw | ConvertFrom-Json
$repository = if ($config.repository) { [string]$config.repository } else { "JayWangsj/ngt-repair-system" }
$installRoot = [System.IO.Path]::GetFullPath([string]$config.installRoot)
$statusFile = Join-Path $installRoot "update-status.json"

function Write-NgtUpdateStatus([string]$Status, [string]$Message = "") {
  @{
    status = $Status
    message = $Message
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath $statusFile -Encoding utf8
}

$studioStopped = $false
try {
  Write-NgtUpdateStatus "checking"
  $latestTagOutput = & $githubCli release view --repo $repository --json tagName --jq ".tagName"
  if (($LASTEXITCODE -ne 0) -or (-not $latestTagOutput)) {
    throw "Unable to read the latest private GitHub release."
  }
  $latestTag = ($latestTagOutput | Out-String).Trim()
  if ($latestTag -eq ("v" + $currentRelease.version)) {
    Write-NgtUpdateStatus "complete"
    Write-Output "NGT is already up to date."
    exit 0
  }

  $downloadRoot = Join-Path $installRoot ("downloads\" + $latestTag)
  $newReleaseRoot = Join-Path $installRoot ("releases\" + $latestTag)
  if (Test-Path -LiteralPath $downloadRoot) {
    throw "Downloaded release files already exist: $downloadRoot"
  }
  if (Test-Path -LiteralPath $newReleaseRoot) {
    throw "Downloaded release already exists: $newReleaseRoot"
  }
  New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
  Write-NgtUpdateStatus "downloading"
  Invoke-NgtCommand $githubCli @(
    "release", "download", $latestTag,
    "--repo", $repository,
    "--pattern", "ngt-studio-windows-*.zip",
    "--pattern", "ngt-studio-windows-*.sha256",
    "--dir", $downloadRoot
  )
  $archive = Get-ChildItem -LiteralPath $downloadRoot -Filter "*.zip" -File | Select-Object -First 1
  $checksumFile = Get-ChildItem -LiteralPath $downloadRoot -Filter "*.sha256" -File | Select-Object -First 1
  if ((-not $archive) -or (-not $checksumFile)) {
    throw "GitHub release is missing the studio archive or checksum."
  }
  $expectedHash = ((Get-Content -LiteralPath $checksumFile.FullName -Raw).Trim() -split "\s+")[0]
  $actualHash = (Get-FileHash -LiteralPath $archive.FullName -Algorithm SHA256).Hash
  if ($actualHash -ne $expectedHash) {
    throw "Studio release checksum does not match."
  }
  New-Item -ItemType Directory -Path $newReleaseRoot -Force | Out-Null
  Expand-Archive -LiteralPath $archive.FullName -DestinationPath $newReleaseRoot
  $newMetadataPath = Join-Path $newReleaseRoot "studio-release.json"
  if (-not (Test-Path -LiteralPath $newMetadataPath)) {
    throw "Downloaded studio release is invalid."
  }
  $newRelease = Get-Content -LiteralPath $newMetadataPath -Raw | ConvertFrom-Json
  if (("v" + $newRelease.version) -ne $latestTag) {
    throw "Downloaded studio release version does not match its GitHub tag."
  }

  Write-NgtUpdateStatus "backing-up"
  Stop-NgtStudioProcesses
  $studioStopped = $true
  $backupOutput = & (Join-Path $PSScriptRoot "backup-windows-studio.ps1") -LeaveStopped
  $backupOutput | Write-Output
  Write-NgtUpdateStatus "installing"
  & (Join-Path $newReleaseRoot "scripts\install-windows-studio.ps1") `
    -DataRoot ([string]$config.dataRoot) `
    -InstallRoot $installRoot `
    -InPlace
  if ($LASTEXITCODE -ne 0) {
    throw "New studio release installer failed."
  }
  Write-NgtUpdateStatus "complete"
  Write-Output "NGT studio updated: v$($currentRelease.version) -> $latestTag"
} catch {
  $failure = $_.Exception.Message
  if ($studioStopped) {
    try {
      & (Join-Path $script:NgtProjectRoot "scripts\install-windows-startup.ps1")
      Wait-NgtStudioHealth
    } catch {
      $failure += " Previous release restart also failed: $($_.Exception.Message)"
    }
  }
  Write-NgtUpdateStatus "failed" $failure
  throw "Studio update failed. $failure"
}
