param(
  [string]$UpdateId,
  [string]$ExpectedTargetVersion,
  [string]$StatusFile,
  [string]$UpdateLockFile,
  [string]$LogFile
)

$ErrorActionPreference = "Stop"
$script:NgtUpdateCreatedAt = (Get-Date).ToUniversalTime().ToString("o")
$script:NgtCompletedUpdateStages = @()
$script:NgtSkippedUpdateStages = @()
$script:NgtCurrentTargetVersion = $ExpectedTargetVersion
$script:NgtUpdateExecutorConfirmed = $false

function Protect-NgtUpdateText([string]$Value) {
  return $Value `
    -replace "github_pat_[A-Za-z0-9_]+", "[redacted token]" `
    -replace "gh[pousr]_[A-Za-z0-9]{20,}", "[redacted token]" `
    -replace "(?i)(token\s*[:=]\s*)\S+", '$1[redacted]'
}

function Write-NgtUpdateStatus(
  [string]$Status,
  [string]$Message = "",
  [hashtable]$Details = @{}
) {
  $payload = @{
    status = $Status
    message = Protect-NgtUpdateText $Message
    updateId = $UpdateId
    targetVersion = $script:NgtCurrentTargetVersion
    executorPid = $PID
    executorConfirmed = $script:NgtUpdateExecutorConfirmed
    createdAt = $script:NgtUpdateCreatedAt
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    completedStages = @($script:NgtCompletedUpdateStages)
    skippedStages = @($script:NgtSkippedUpdateStages)
  }
  foreach ($key in $Details.Keys) {
    $value = $Details[$key]
    if ($value -is [string]) { $value = Protect-NgtUpdateText $value }
    $payload[$key] = $value
  }
  $temporaryStatusFile = "$StatusFile.$UpdateId.tmp"
  $json = $payload | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText(
    $temporaryStatusFile,
    $json,
    (New-Object System.Text.UTF8Encoding($false))
  )
  try {
    if (Test-Path -LiteralPath $StatusFile) {
      [System.IO.File]::Replace($temporaryStatusFile, $StatusFile, $null)
    } else {
      [System.IO.File]::Move($temporaryStatusFile, $StatusFile)
    }
  } catch {
    Move-Item -LiteralPath $temporaryStatusFile -Destination $StatusFile -Force
  } finally {
    Remove-Item -LiteralPath $temporaryStatusFile -Force -ErrorAction SilentlyContinue
  }
}

function Complete-NgtUpdateStage([string]$Stage) {
  if ($script:NgtCompletedUpdateStages -notcontains $Stage) {
    $script:NgtCompletedUpdateStages += $Stage
  }
}

function ConvertTo-NgtProcessArgument([string]$Value) {
  return '"' + $Value.Replace('"', '\"') + '"'
}

$studioStopped = $false
$backupRoot = $null
$recoveryStatus = "not-started"
$recoveryMessage = ""
$previousVersion = ""
$failedStage = "initializing"
$transcriptStarted = $false
$currentStage = "initializing"
$totalBytes = [long]0
$downloadedBytes = [long]0
$bytesPerSecond = [long]0
$etaSeconds = 0
try {
  try {
    New-Item -ItemType Directory -Path (Split-Path -Parent $LogFile) -Force | Out-Null
    Start-Transcript -Path $LogFile -Force | Out-Null
    $transcriptStarted = $true
  } catch {
    Write-Output "Update transcript is unavailable: $($_.Exception.Message)"
  }
  . (Join-Path $PSScriptRoot "windows-studio-common.ps1")
  . (Join-Path $PSScriptRoot "studio-runtime.ps1")
  Set-Location -LiteralPath $script:NgtProjectRoot
  $config = Set-NgtStudioEnvironment
  $githubCli = Get-NgtGitHubCli
  $releaseFile = Join-Path $script:NgtProjectRoot "studio-release.json"
  if (-not (Test-Path -LiteralPath $releaseFile)) {
    throw "One-click studio updates require an installed Windows studio release."
  }
  $currentRelease = Get-Content -LiteralPath $releaseFile -Raw | ConvertFrom-Json
  $previousVersion = [string]$currentRelease.version
  $script:NgtCurrentTargetVersion = $ExpectedTargetVersion
  $previousReleaseRoot = $script:NgtProjectRoot
  $previousStudioConfig = Get-Content -LiteralPath (Join-Path $script:NgtStateDirectory "studio.json") -Raw | ConvertFrom-Json
  $repository = if ($config.repository) { [string]$config.repository } else { "JayWangsj/ngt-repair-system" }
  $installRoot = [System.IO.Path]::GetFullPath([string]$config.installRoot)
  $currentStage = "reading-release"
  $script:NgtUpdateExecutorConfirmed = $true
  Write-NgtUpdateStatus "running" "" @{ stage = $currentStage; previousVersion = $previousVersion }
  $releaseOutput = & $githubCli release view --repo $repository --json "tagName,assets"
  if (($LASTEXITCODE -ne 0) -or (-not $releaseOutput)) {
    throw "Unable to read the latest private GitHub release."
  }
  $release = ($releaseOutput | Out-String) | ConvertFrom-Json
  $latestTag = [string]$release.tagName
  $script:NgtCurrentTargetVersion = $latestTag -replace "^v", ""
  if ($ExpectedTargetVersion -and ($script:NgtCurrentTargetVersion -ne ($ExpectedTargetVersion -replace "^v", ""))) {
    throw "The available release changed after confirmation. Check updates and confirm again."
  }
  if ($latestTag -eq ("v" + $currentRelease.version)) {
    Write-NgtUpdateStatus "complete" "" @{ stage = "complete"; latestVersion = $latestTag; actualVersion = [string]$currentRelease.version }
    Write-Output "NGT is already up to date."
    exit 0
  }

  $archiveName = "ngt-studio-windows-$latestTag.zip"
  $checksumName = "$archiveName.sha256"
  $archiveAsset = @($release.assets) |
    Where-Object { $_.name -eq $archiveName } |
    Select-Object -First 1
  $checksumAsset = @($release.assets) |
    Where-Object { $_.name -eq $checksumName } |
    Select-Object -First 1
  if ((-not $archiveAsset) -or (-not $checksumAsset)) {
    throw "GitHub release is missing the studio archive or checksum."
  }
  Complete-NgtUpdateStage "reading-release"

  $downloadRoot = Join-Path $installRoot ("downloads\" + $latestTag)
  $newReleaseRoot = Join-Path $installRoot ("releases\" + $latestTag)
  $reuseRelease = $false
  if (Test-Path -LiteralPath $newReleaseRoot) {
    $existingMetadata = Join-Path $newReleaseRoot "studio-release.json"
    if (-not (Test-Path -LiteralPath $existingMetadata)) {
      throw "An incomplete release directory needs manual review: $newReleaseRoot"
    }
    $existingRelease = Get-Content -LiteralPath $existingMetadata -Raw | ConvertFrom-Json
    if (("v" + $existingRelease.version) -ne $latestTag) {
      throw "An unrelated release directory already exists: $newReleaseRoot"
    }
    $reuseRelease = $true
  }
  if (-not $reuseRelease) {
    if (Test-Path -LiteralPath $downloadRoot) {
      Remove-Item -LiteralPath $downloadRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
    Invoke-NgtCommand $githubCli @(
      "release", "download", $latestTag,
      "--repo", $repository,
      "--pattern", ([string]$checksumAsset.name),
      "--dir", $downloadRoot
    )
  }
  New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null

  $totalBytes = [long]$archiveAsset.size
  $archivePath = Join-Path $downloadRoot ([string]$archiveAsset.name)
  $downloadErrorPath = Join-Path $downloadRoot "download.error.log"
  if (-not $reuseRelease) {
  $currentStage = "downloading"
  Write-NgtUpdateStatus "downloading" "" @{
    stage = $currentStage
    latestVersion = $latestTag
    bytesDownloaded = 0
    totalBytes = $totalBytes
    bytesPerSecond = 0
    progressKnown = $false
  }
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
    $downloadedBytes = [long](@(
      Get-ChildItem -LiteralPath $downloadRoot -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne $checksumAsset.name -and $_.Name -ne "download.error.log" } |
        Measure-Object -Property Length -Sum
    )[0].Sum)
    $elapsedSeconds = [Math]::Max(0.001, ((Get-Date) - $downloadStart).TotalSeconds)
    $bytesPerSecond = [long]($downloadedBytes / $elapsedSeconds)
    $etaSeconds = if (($totalBytes -gt $downloadedBytes) -and ($bytesPerSecond -gt 0)) {
      [int][Math]::Ceiling(($totalBytes - $downloadedBytes) / $bytesPerSecond)
    } else { 0 }
    Write-NgtUpdateStatus "downloading" "" @{
      stage = $currentStage
      latestVersion = $latestTag
      bytesDownloaded = $downloadedBytes
      totalBytes = $totalBytes
      bytesPerSecond = $bytesPerSecond
      etaSeconds = $etaSeconds
      progressKnown = (($totalBytes -gt 0) -and ($downloadedBytes -gt 0))
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
  Complete-NgtUpdateStage "downloading"
  } else {
    $script:NgtSkippedUpdateStages += @("downloading", "verifying")
  }
  if (-not $reuseRelease) {
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
  }
  if (-not $reuseRelease) {
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
    $stagingRoot = Join-Path $installRoot ("downloads\" + $latestTag + "-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
    try {
      & tar.exe -xf $archive.FullName -C $stagingRoot
      if ($LASTEXITCODE -ne 0) { throw "Studio release extraction failed." }
      $stagedMetadata = Join-Path $stagingRoot "studio-release.json"
      if (-not (Test-Path -LiteralPath $stagedMetadata)) {
        throw "Downloaded studio release is invalid."
      }
      $stagedRelease = Get-Content -LiteralPath $stagedMetadata -Raw | ConvertFrom-Json
      if (("v" + $stagedRelease.version) -ne $latestTag) {
        throw "Downloaded studio release version does not match its GitHub tag."
      }
      Complete-NgtUpdateStage "verifying"
      $currentStage = "preparing-runtime"
      Write-NgtUpdateStatus "preparing-runtime" "" @{
        stage = $currentStage
        latestVersion = $latestTag
        bytesDownloaded = $downloadedBytes
        totalBytes = $totalBytes
        progressKnown = ($totalBytes -gt 0)
      }
      $sharedRuntime = Join-Path (Join-Path $installRoot "runtimes") ([string]$stagedRelease.runtimeHash)
      if (-not (Test-Path -LiteralPath $sharedRuntime)) {
        $runtimeArchiveName = "ngt-studio-runtime-$latestTag.zip"
        $runtimeChecksumName = "$runtimeArchiveName.sha256"
        $runtimeArchiveAsset = @($release.assets) | Where-Object { $_.name -eq $runtimeArchiveName } | Select-Object -First 1
        $runtimeChecksumAsset = @($release.assets) | Where-Object { $_.name -eq $runtimeChecksumName } | Select-Object -First 1
        if ((-not $runtimeArchiveAsset) -or (-not $runtimeChecksumAsset)) {
          throw "GitHub release is missing the required runtime package or checksum."
        }
        Invoke-NgtCommand $githubCli @(
          "release", "download", $latestTag, "--repo", $repository,
          "--pattern", $runtimeChecksumName, "--pattern", $runtimeArchiveName,
          "--dir", $downloadRoot
        )
        $runtimeArchivePath = Join-Path $downloadRoot $runtimeArchiveName
        $runtimeChecksumPath = Join-Path $downloadRoot $runtimeChecksumName
        $expectedRuntimeHash = ((Get-Content -LiteralPath $runtimeChecksumPath -Raw).Trim() -split "\s+")[0]
        $actualRuntimeHash = (Get-FileHash -LiteralPath $runtimeArchivePath -Algorithm SHA256).Hash
        if ($actualRuntimeHash -ne $expectedRuntimeHash) {
          throw "Studio runtime package checksum does not match."
        }
        Install-NgtRuntimeArchive -ArchivePath $runtimeArchivePath `
          -ExpectedHash ([string]$stagedRelease.runtimeHash) -InstallRoot $installRoot
      }
      Move-Item -LiteralPath $stagingRoot -Destination $newReleaseRoot
    } finally {
      if (Test-Path -LiteralPath $stagingRoot) {
        Remove-Item -LiteralPath $stagingRoot -Recurse -Force
      }
    }
  } else {
    $script:NgtSkippedUpdateStages += "preparing-runtime"
  }
  $newMetadataPath = Join-Path $newReleaseRoot "studio-release.json"
  if (-not (Test-Path -LiteralPath $newMetadataPath)) {
    throw "Downloaded studio release is invalid."
  }
  $newRelease = Get-Content -LiteralPath $newMetadataPath -Raw | ConvertFrom-Json
  if (("v" + $newRelease.version) -ne $latestTag) {
    throw "Downloaded studio release version does not match its GitHub tag."
  }

  if ($script:NgtSkippedUpdateStages -notcontains "preparing-runtime") {
    Complete-NgtUpdateStage "preparing-runtime"
  }
  $currentStage = "backing-up"
  Write-NgtUpdateStatus "backing-up" "" @{
    stage = $currentStage
    latestVersion = $latestTag
    bytesDownloaded = $downloadedBytes
    totalBytes = $totalBytes
    progressKnown = ($totalBytes -gt 0)
  }
  Stop-NgtStudioProcesses
  $studioStopped = $true
  $backupOutput = & (Join-Path $PSScriptRoot "backup-windows-studio.ps1") -LeaveStopped
  $backupLine = @($backupOutput | Where-Object { $_ -like "Studio backup created: *" } | Select-Object -Last 1)
  if (-not $backupLine) { throw "Studio backup did not return its destination." }
  $backupRoot = [string]$backupLine[0].Substring("Studio backup created: ".Length)
  $backupOutput | Write-Output
  Complete-NgtUpdateStage "backing-up"
  $currentStage = "installing"
  Write-NgtUpdateStatus "installing" "" @{
    stage = $currentStage
    latestVersion = $latestTag
    bytesDownloaded = $downloadedBytes
    totalBytes = $totalBytes
    progressKnown = ($totalBytes -gt 0)
  }
  & (Join-Path $newReleaseRoot "scripts\install-windows-studio.ps1") `
    -DataRoot ([string]$config.dataRoot) `
    -InstallRoot $installRoot `
    -InPlace
  if ($LASTEXITCODE -ne 0) {
    throw "New studio release installer failed."
  }
  Complete-NgtUpdateStage "installing"
  $currentStage = "validating"
  Write-NgtUpdateStatus "validating" "" @{
    stage = $currentStage
    latestVersion = $latestTag
    bytesDownloaded = $downloadedBytes
    totalBytes = $totalBytes
    progressKnown = ($totalBytes -gt 0)
  }
  Wait-NgtStudioHealth -ExpectedVersion ([string]$newRelease.version)
  Complete-NgtUpdateStage "validating"
  Remove-Item -LiteralPath $downloadRoot -Recurse -Force -ErrorAction SilentlyContinue
  $releaseDirectories = @(Get-ChildItem -LiteralPath (Join-Path $installRoot "releases") -Directory |
    Sort-Object { [version](($_.Name -replace "^v", "").Split("-")[0]) } -Descending)
  foreach ($oldRelease in @($releaseDirectories | Select-Object -Skip 2)) {
    Remove-Item -LiteralPath $oldRelease.FullName -Recurse -Force
  }
  Remove-NgtUnusedRuntimes -InstallRoot $installRoot
  Write-NgtUpdateStatus "complete" "" @{
    stage = "complete"
    latestVersion = $latestTag
    actualVersion = [string]$newRelease.version
    bytesDownloaded = $downloadedBytes
    totalBytes = $totalBytes
    progressKnown = ($totalBytes -gt 0)
  }
  Write-Output "NGT studio updated: v$($currentRelease.version) -> $latestTag"
} catch {
  $failure = $_.Exception.Message
  $failedStage = $currentStage
  if ($studioStopped) {
    $recoveryStatus = "running"
    try {
      $currentStage = "rolling-back"
      Write-NgtUpdateStatus "rolling-back" $failure @{
        stage = $currentStage
        failedStage = $failedStage
        latestVersion = $script:NgtCurrentTargetVersion
        previousVersion = $previousVersion
        recoveryStatus = $recoveryStatus
      }
      Stop-NgtStudioProcesses
      if ($backupRoot) {
        $dataDirectory = Join-Path ([string]$config.dataRoot) "data"
        $failedDataDirectory = $dataDirectory + ".failed-" + (Get-Date -Format "yyyyMMdd-HHmmss")
        if (Test-Path -LiteralPath $dataDirectory) {
          Move-Item -LiteralPath $dataDirectory -Destination $failedDataDirectory
        }
        New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
        Get-ChildItem -LiteralPath (Join-Path $backupRoot "postgres-data") -Force | ForEach-Object {
          Copy-Item -LiteralPath $_.FullName -Destination $dataDirectory -Recurse -Force
        }
        $backupSecrets = Join-Path $backupRoot "config\local-secrets.json"
        if (Test-Path -LiteralPath $backupSecrets) {
          Copy-Item -LiteralPath $backupSecrets -Destination ([string]$config.dataRoot) -Force
        }
        $backupEnvironment = Join-Path $backupRoot "config\.env"
        if (Test-Path -LiteralPath $backupEnvironment) {
          Copy-Item -LiteralPath $backupEnvironment -Destination $previousReleaseRoot -Force
        }
      }
      $previousStudioConfig | Add-Member -NotePropertyName activeRelease `
        -NotePropertyValue $previousReleaseRoot -Force
      $stableConfigPath = Join-Path $installRoot ".local\studio.json"
      $previousStudioConfig | ConvertTo-Json | Set-Content -LiteralPath $stableConfigPath -Encoding utf8
      $previousStudioConfig | ConvertTo-Json | Set-Content `
        -LiteralPath (Join-Path $previousReleaseRoot ".local\studio.json") -Encoding utf8
      & (Join-Path $previousReleaseRoot "scripts\install-windows-startup.ps1")
      Wait-NgtStudioHealth -ExpectedVersion $previousVersion
      $recoveryStatus = "succeeded"
      $recoveryMessage = "The previous studio version was restored and verified."
    } catch {
      $recoveryStatus = "failed"
      $recoveryMessage = $_.Exception.Message
      $failure += " Previous release restart also failed: $recoveryMessage"
    }
  }
  Write-NgtUpdateStatus "failed" $failure @{
    stage = $failedStage
    failedStage = $failedStage
    previousVersion = $previousVersion
    actualVersion = if ($recoveryStatus -eq "succeeded") { $previousVersion } else { "" }
    recoveryStatus = $recoveryStatus
    recoveryMessage = $recoveryMessage
    bytesDownloaded = $downloadedBytes
    totalBytes = $totalBytes
    bytesPerSecond = $bytesPerSecond
    etaSeconds = $etaSeconds
    progressKnown = (($totalBytes -gt 0) -and ($downloadedBytes -gt 0))
  }
  throw "Studio update failed. $failure"
} finally {
  if ($transcriptStarted) {
    try { Stop-Transcript | Out-Null } catch { }
  }
  Remove-Item -LiteralPath $updateLockFile -Force -ErrorAction SilentlyContinue
}
