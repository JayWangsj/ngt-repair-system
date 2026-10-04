$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "windows-studio-common.ps1")

Set-Location -LiteralPath $script:NgtProjectRoot
Assert-NgtCommand "gh"
$config = Set-NgtStudioEnvironment
$releaseFile = Join-Path $script:NgtProjectRoot "studio-release.json"
if (-not (Test-Path -LiteralPath $releaseFile)) {
  throw "One-click studio updates require an installed Windows studio release."
}
$currentRelease = Get-Content -LiteralPath $releaseFile -Raw | ConvertFrom-Json
$repository = if ($config.repository) { [string]$config.repository } else { "JayWangsj/ngt-repair-system" }
$latestTagOutput = & gh release view --repo $repository --json tagName --jq ".tagName"
if (($LASTEXITCODE -ne 0) -or (-not $latestTagOutput)) {
  throw "Unable to read the latest private GitHub release. Run gh auth login first."
}
$latestTag = ($latestTagOutput | Out-String).Trim()
if ($latestTag -eq ("v" + $currentRelease.version)) {
  Write-Output "NGT is already up to date."
  exit 0
}

$installRoot = [System.IO.Path]::GetFullPath([string]$config.installRoot)
$downloadRoot = Join-Path $installRoot ("downloads\" + $latestTag)
$newReleaseRoot = Join-Path $installRoot ("releases\" + $latestTag)
if (Test-Path -LiteralPath $downloadRoot) {
  throw "Downloaded release files already exist: $downloadRoot"
}
if (Test-Path -LiteralPath $newReleaseRoot) {
  throw "Downloaded release already exists: $newReleaseRoot"
}
New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
Invoke-NgtCommand "gh" @(
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

Stop-NgtStudioProcesses
$backupOutput = & (Join-Path $PSScriptRoot "backup-windows-studio.ps1") -LeaveStopped
$backupOutput | Write-Output
try {
  & (Join-Path $newReleaseRoot "scripts\install-windows-studio.ps1") `
    -DataRoot ([string]$config.dataRoot) `
    -InstallRoot $installRoot `
    -InPlace
  if ($LASTEXITCODE -ne 0) {
    throw "New studio release installer failed."
  }
} catch {
  & (Join-Path $script:NgtProjectRoot "scripts\install-windows-startup.ps1")
  Wait-NgtStudioHealth
  throw "Studio update failed. The previous release was restarted. Database backup: $backupOutput`n$($_.Exception.Message)"
}
Write-Output "NGT studio updated: v$($currentRelease.version) -> $latestTag"
