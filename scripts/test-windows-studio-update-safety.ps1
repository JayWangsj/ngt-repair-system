$ErrorActionPreference = "Stop"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ngt-update-safety-" + [guid]::NewGuid().ToString("N"))
$installRoot = Join-Path $testRoot "install"
$releasesRoot = Join-Path $installRoot "releases"
New-Item -ItemType Directory -Path $releasesRoot -Force | Out-Null

try {
  $currentRelease = Join-Path $releasesRoot "v2.0.9"
  $failedRelease = Join-Path $releasesRoot "v2.0.10"
  $targetRelease = Join-Path $releasesRoot "v2.0.11"
  foreach ($directory in @($currentRelease, $failedRelease, $targetRelease)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  & (Join-Path $PSScriptRoot "retain-windows-studio-releases.ps1") `
    -InstallRoot $installRoot `
    -CurrentReleaseRoot $currentRelease `
    -TargetReleaseRoot $targetRelease `
    -PreviousReleaseRoot $currentRelease
  if (-not (Test-Path -LiteralPath $currentRelease) -or
      -not (Test-Path -LiteralPath $targetRelease) -or
      (Test-Path -LiteralPath $failedRelease)) {
    throw "Release retention did not protect the actual rollback version."
  }

  $releaseFixture = Join-Path $testRoot "release-fixture"
  New-Item -ItemType Directory -Path (Join-Path $releaseFixture ".next\standalone") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $releaseFixture ".local") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $releaseFixture "scripts") -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $releaseFixture "prisma") -Force | Out-Null
  $releaseFiles = @(
    ".next/standalone/server.js",
    "scripts/update-windows-studio.ps1",
    "scripts/check-windows-credential-store.ps1",
    "scripts/install-windows-studio.ps1",
    "scripts/retain-windows-studio-releases.ps1",
    "scripts/verify-windows-studio-release.ps1",
    "scripts/test-windows-studio-update-safety.ps1",
    "prisma/schema.prisma"
  )
  $manifest = @{}
  foreach ($relativePath in $releaseFiles) {
    $filePath = Join-Path $releaseFixture ($relativePath.Replace("/", "\"))
    Set-Content -LiteralPath $filePath -Value $relativePath -Encoding ascii
    $manifest[$relativePath] = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  @{ version = "2.0.11"; files = $manifest } |
    ConvertTo-Json -Depth 4 |
    Set-Content -LiteralPath (Join-Path $releaseFixture "studio-release.json") -Encoding utf8
  Set-Content -LiteralPath (Join-Path $releaseFixture ".local\studio.json") `
    -Value '{"installRoot":"isolated"}' -Encoding ascii
  & (Join-Path $PSScriptRoot "verify-windows-studio-release.ps1") `
    -ReleaseRoot $releaseFixture -ExpectedVersion "v2.0.11" | Out-Null
  Set-Content -LiteralPath (Join-Path $releaseFixture "scripts\unlisted.ps1") `
    -Value "unlisted" -Encoding ascii
  $unlistedRejected = $false
  try {
    & (Join-Path $PSScriptRoot "verify-windows-studio-release.ps1") `
      -ReleaseRoot $releaseFixture -ExpectedVersion "2.0.11" | Out-Null
  } catch { $unlistedRejected = $true }
  if (-not $unlistedRejected) { throw "Release integrity validation accepted an unlisted file." }
  Remove-Item -LiteralPath (Join-Path $releaseFixture "scripts\unlisted.ps1") -Force
  Set-Content -LiteralPath (Join-Path $releaseFixture "scripts\update-windows-studio.ps1") `
    -Value "tampered" -Encoding ascii
  $integrityRejected = $false
  try {
    & (Join-Path $PSScriptRoot "verify-windows-studio-release.ps1") `
      -ReleaseRoot $releaseFixture -ExpectedVersion "2.0.11" | Out-Null
  } catch { $integrityRejected = $true }
  if (-not $integrityRejected) { throw "Release integrity validation accepted a modified file." }

  $backupRoot = Join-Path $testRoot "backup-fixture"
  New-Item -ItemType Directory -Path (Join-Path $backupRoot "postgres-data\base") -Force | Out-Null
  $databaseFile = Join-Path $backupRoot "postgres-data\base\1"
  Set-Content -LiteralPath $databaseFile -Value "isolated database fixture" -Encoding ascii
  $backupHash = (Get-FileHash -LiteralPath $databaseFile -Algorithm SHA256).Hash
  Set-Content -LiteralPath (Join-Path $backupRoot "SHA256SUMS.txt") `
    -Value ("$backupHash  postgres-data\base\1") -Encoding ascii
  & (Join-Path $PSScriptRoot "test-windows-studio-backup.ps1") `
    -BackupRoot $backupRoot | Out-Null
  Set-Content -LiteralPath $databaseFile -Value "corrupted fixture" -Encoding ascii
  $backupRejected = $false
  try {
    & (Join-Path $PSScriptRoot "test-windows-studio-backup.ps1") `
      -BackupRoot $backupRoot | Out-Null
  } catch { $backupRejected = $true }
  if (-not $backupRejected) { throw "Backup validation accepted a modified database file." }

  $eventsPath = Join-Path $testRoot "mutex-events.txt"
  $firstOutput = Join-Path $testRoot "mutex-one.out"
  $firstError = Join-Path $testRoot "mutex-one.err"
  $secondOutput = Join-Path $testRoot "mutex-two.out"
  $secondError = Join-Path $testRoot "mutex-two.err"
  $mutexRoot = [System.IO.Path]::GetFullPath((Join-Path $testRoot "mutex-install")).TrimEnd("\").ToLowerInvariant()
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $rootBytes = [System.Text.Encoding]::UTF8.GetBytes($mutexRoot)
    $rootHash = [System.BitConverter]::ToString($sha256.ComputeHash($rootBytes)).Replace("-", "").ToLowerInvariant()
  } finally { $sha256.Dispose() }
  $mutexName = "Global\NGTStudioUpdate-$rootHash"
  $childScript = Join-Path $testRoot "mutex-child.ps1"
  @'
param([string]$MutexName, [string]$EventsPath, [string]$Slot)
$mutex = [System.Threading.Mutex]::new($false, $MutexName)
$owned = $false
try {
  try { $owned = $mutex.WaitOne(10000) } catch [System.Threading.AbandonedMutexException] { $owned = $true }
  if (-not $owned) { throw "Mutex acquisition timed out." }
  Add-Content -LiteralPath $EventsPath -Value ("start-" + $Slot)
  Start-Sleep -Milliseconds 400
  Add-Content -LiteralPath $EventsPath -Value ("end-" + $Slot)
} finally {
  if ($owned) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
'@ | Set-Content -LiteralPath $childScript -Encoding utf8
  $quotedScript = '"' + $childScript + '"'
  $quotedEvents = '"' + $eventsPath + '"'
  $quotedMutex = '"' + $mutexName + '"'
  $first = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File $quotedScript -MutexName $quotedMutex -EventsPath $quotedEvents -Slot one" -RedirectStandardOutput $firstOutput -RedirectStandardError $firstError -WindowStyle Hidden -PassThru
  $second = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File $quotedScript -MutexName $quotedMutex -EventsPath $quotedEvents -Slot two" -RedirectStandardOutput $secondOutput -RedirectStandardError $secondError -WindowStyle Hidden -PassThru
  $first.WaitForExit(15000) | Out-Null
  $second.WaitForExit(15000) | Out-Null
  if (-not $first.HasExited -or -not $second.HasExited -or $first.ExitCode -ne 0 -or $second.ExitCode -ne 0) {
    $firstFailure = if (Test-Path -LiteralPath $firstError) { Get-Content -LiteralPath $firstError -Raw } else { "" }
    $secondFailure = if (Test-Path -LiteralPath $secondError) { Get-Content -LiteralPath $secondError -Raw } else { "" }
    throw "Parallel update mutex behavior test failed (exit codes $($first.ExitCode), $($second.ExitCode)): $firstFailure $secondFailure"
  }
  $events = @(Get-Content -LiteralPath $eventsPath)
  $firstSlot = if ($events.Count -gt 0 -and $events[0] -match "^start-(one|two)$") { $Matches[1] } else { "" }
  $secondSlot = if ($events.Count -gt 2 -and $events[2] -match "^start-(one|two)$") { $Matches[1] } else { "" }
  if ($events.Count -ne 4 -or
      -not $firstSlot -or $events[1] -ne "end-$firstSlot" -or
      -not $secondSlot -or $secondSlot -eq $firstSlot -or $events[3] -ne "end-$secondSlot") {
    throw "The update mutex allowed concurrent owners."
  }
  Write-Output "Windows update safety behavior tests passed."
} finally {
  Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
