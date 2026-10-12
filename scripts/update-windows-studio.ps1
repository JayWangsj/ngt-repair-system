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

function Write-NgtUpdateStatus(
  [string]$Status,
  [string]$Message = "",
  [hashtable]$Details = @{}
) {
  $payload = @{
    status = $Status
    message = $Message
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  foreach ($key in $Details.Keys) {
    $payload[$key] = $Details[$key]
  }
  $payload | ConvertTo-Json | Set-Content -LiteralPath $statusFile -Encoding utf8
}

function ConvertTo-NgtProcessArgument([string]$Value) {
  return '"' + $Value.Replace('"', '\"') + '"'
}

$studioStopped = $false
$currentStage = "checking"
try {
  Write-NgtUpdateStatus "checking" "" @{ stage = $currentStage }
  $releaseOutput = & $githubCli release view --repo $repository --json "tagName,assets"
  if (($LASTEXITCODE -ne 0) -or (-not $releaseOutput)) {
    throw "Unable to read the latest private GitHub release."
  }
  $release = ($releaseOutput | Out-String) | ConvertFrom-Json
  $latestTag = [string]$release.tagName
  if ($latestTag -eq ("v" + $currentRelease.version)) {
    Write-NgtUpdateStatus "complete" "" @{ stage = "complete"; latestVersion = $latestTag }
    Write-Output "NGT is already up to date."
    exit 0
  }

  $archiveAsset = @($release.assets) |
    Where-Object { $_.name -like "ngt-studio-windows-*.zip" } |
    Select-Object -First 1
  $checksumAsset = @($release.assets) |
    Where-Object { $_.name -like "ngt-studio-windows-*.sha256" } |
    Select-Object -First 1
  if ((-not $archiveAsset) -or (-not $checksumAsset)) {
    throw "GitHub release is missing the studio archive or checksum."
  }

  $downloadRoot = Join-Path $installRoot ("downloads\" + $latestTag)
  $newReleaseRoot = Join-Path $installRoot ("releases\" + $latestTag)
  if (Test-Path -LiteralPath $downloadRoot) {
    Remove-Item -LiteralPath $downloadRoot -Recurse -Force
  }
  if (Test-Path -LiteralPath $newReleaseRoot) {
    throw "Downloaded release already exists: $newReleaseRoot"
  }
  New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
  Invoke-NgtCommand $githubCli @(
    "release", "download", $latestTag,
    "--repo", $repository,
    "--pattern", ([string]$checksumAsset.name),
    "--dir", $downloadRoot
  )

  $currentStage = "downloading"
  $totalBytes = [long]$archiveAsset.size
  Write-NgtUpdateStatus "downloading" "" @{
    stage = $currentStage
    latestVersion = $latestTag
    bytesDownloaded = 0
    totalBytes = $totalBytes
    bytesPerSecond = 0
    progressKnown = $false
  }
  $archivePath = Join-Path $downloadRoot ([string]$archiveAsset.name)
  $downloadErrorPath = Join-Path $downloadRoot "download.error.log"
  $downloadArguments = @(
    "release", "download", $latestTag,
    "--repo", $repository,
    "--pattern", ([string]$archiveAsset.name),
    "--dir", $downloadRoot
  ) | ForEach-Object { ConvertTo-NgtProcessArgument ([string]$_) }
  $downloadStart = Get-Date
  $processInfo = New-Object System.Diagnostics.ProcessStartInfo
  $processInfo.FileName = $githubCli
  $processInfo.Arguments = $downloadArguments -join " "
  $processInfo.WorkingDirectory = $script:NgtProjectRoot
  $processInfo.UseShellExecute = $false
  $processInfo.CreateNoWindow = $true
  $processInfo.RedirectStandardOutput = $true
  $processInfo.RedirectStandardError = $true
  $downloadProcess = New-Object System.Diagnostics.Process
  $downloadProcess.StartInfo = $processInfo
  if (-not $downloadProcess.Start()) {
    throw "Unable to start the GitHub release download."
  }
  $downloadOutput = $downloadProcess.StandardOutput.ReadToEndAsync()
  $downloadError = $downloadProcess.StandardError.ReadToEndAsync()
  while (-not $downloadProcess.WaitForExit(1000)) {
    $downloadProcess.Refresh()
    $bytesDownloaded = [long](@(
      Get-ChildItem -LiteralPath $downloadRoot -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne $checksumAsset.name -and $_.Name -ne "download.error.log" } |
        Measure-Object -Property Length -Sum
    )[0].Sum)
    $elapsedSeconds = [Math]::Max(0.001, ((Get-Date) - $downloadStart).TotalSeconds)
    $bytesPerSecond = [long]($bytesDownloaded / $elapsedSeconds)
    $etaSeconds = if (($totalBytes -gt $bytesDownloaded) -and ($bytesPerSecond -gt 0)) {
      [int][Math]::Ceiling(($totalBytes - $bytesDownloaded) / $bytesPerSecond)
    } else { 0 }
    Write-NgtUpdateStatus "downloading" "" @{
      stage = $currentStage
      latestVersion = $latestTag
      bytesDownloaded = $bytesDownloaded
      totalBytes = $totalBytes
      bytesPerSecond = $bytesPerSecond
      etaSeconds = $etaSeconds
      progressKnown = (($totalBytes -gt 0) -and ($bytesDownloaded -gt 0))
    }
  }
  $downloadProcess.WaitForExit()
  $downloadProcess.Refresh()
  $downloadOutputText = $downloadOutput.Result
  $downloadErrorText = $downloadError.Result
  if ($downloadProcess.ExitCode -ne 0) {
    Set-Content -LiteralPath $downloadErrorPath -Value $downloadErrorText -Encoding utf8
    $failureDetail = ($downloadErrorText | Out-String).Trim()
    if (-not $failureDetail) { $failureDetail = "GitHub CLI exited with code $($downloadProcess.ExitCode)." }
    throw "Release download failed. $failureDetail"
  }
  if ($downloadOutputText) { $downloadOutputText | Write-Output }

  if (-not (Test-Path -LiteralPath $archivePath)) {
    throw "GitHub release archive was not downloaded."
  }
  $downloadedBytes = (Get-Item -LiteralPath $archivePath).Length
  Write-NgtUpdateStatus "downloaded" "" @{
    stage = "downloaded"
    latestVersion = $latestTag
    bytesDownloaded = $downloadedBytes
    totalBytes = $totalBytes
    bytesPerSecond = 0
    etaSeconds = 0
    progressKnown = ($totalBytes -gt 0)
  }

  $currentStage = "verifying"
  Write-NgtUpdateStatus "verifying" "" @{
    stage = $currentStage
    latestVersion = $latestTag
    bytesDownloaded = $downloadedBytes
    totalBytes = $totalBytes
    progressKnown = ($totalBytes -gt 0)
  }
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

  $currentStage = "backing-up"
  Write-NgtUpdateStatus "backing-up" "" @{ stage = $currentStage; latestVersion = $latestTag }
  Stop-NgtStudioProcesses
  $studioStopped = $true
  $backupOutput = & (Join-Path $PSScriptRoot "backup-windows-studio.ps1") -LeaveStopped
  $backupOutput | Write-Output
  $currentStage = "installing"
  Write-NgtUpdateStatus "installing" "" @{ stage = $currentStage; latestVersion = $latestTag }
  & (Join-Path $newReleaseRoot "scripts\install-windows-studio.ps1") `
    -DataRoot ([string]$config.dataRoot) `
    -InstallRoot $installRoot `
    -InPlace
  if ($LASTEXITCODE -ne 0) {
    throw "New studio release installer failed."
  }
  $currentStage = "validating"
  Write-NgtUpdateStatus "validating" "" @{ stage = $currentStage; latestVersion = $latestTag }
  Wait-NgtStudioHealth
  Write-NgtUpdateStatus "complete" "" @{ stage = "complete"; latestVersion = $latestTag }
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
  Write-NgtUpdateStatus "failed" $failure @{ stage = $currentStage }
  throw "Studio update failed. $failure"
}
