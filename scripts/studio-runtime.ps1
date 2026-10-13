$ErrorActionPreference = "Stop"

function Get-NgtRuntimeHash([string]$RuntimeDirectory) {
  $runtimePrefix = [System.IO.Path]::GetFullPath($RuntimeDirectory).TrimEnd("\") + "\"
  $runtimeManifest = @(Get-ChildItem -LiteralPath $RuntimeDirectory -File -Recurse -Force |
    Sort-Object FullName |
    ForEach-Object {
      $relativePath = $_.FullName.Substring($runtimePrefix.Length).Replace("\", "/")
      $fileHash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
      "$fileHash  $relativePath"
    })
  $hasher = [System.Security.Cryptography.SHA256]::Create()
  try {
    return [System.BitConverter]::ToString(
      $hasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes(($runtimeManifest -join "`n")))
    ).Replace("-", "").ToLowerInvariant()
  } finally {
    $hasher.Dispose()
  }
}

function Install-NgtSharedRuntime([string]$ProjectRoot, [string]$InstallRoot) {
  $releaseMetadata = Get-Content -LiteralPath (Join-Path $ProjectRoot "studio-release.json") -Raw | ConvertFrom-Json
  $runtimeHash = [string]$releaseMetadata.runtimeHash
  if (-not $runtimeHash) {
    throw "Studio release is missing its runtime hash."
  }
  $releaseRuntime = Join-Path $ProjectRoot "runtime"
  $runtimeRoot = Join-Path $InstallRoot "runtimes"
  $sharedRuntime = Join-Path $runtimeRoot $runtimeHash
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null

  if (Test-Path -LiteralPath $sharedRuntime) {
    $actualRuntimeHash = Get-NgtRuntimeHash $sharedRuntime
    if ($actualRuntimeHash -ne $runtimeHash) {
      throw "The cached studio runtime is invalid: $runtimeHash"
    }
  }
  if (-not (Test-Path -LiteralPath $sharedRuntime)) {
    if (-not (Test-Path -LiteralPath $releaseRuntime)) {
      throw "The required studio runtime is not installed: $runtimeHash"
    }
    Move-Item -LiteralPath $releaseRuntime -Destination $sharedRuntime
  } elseif (Test-Path -LiteralPath $releaseRuntime) {
    Remove-Item -LiteralPath $releaseRuntime -Recurse -Force
  }

  New-Item -ItemType Directory -Path $releaseRuntime -Force | Out-Null
  $sharedPrefix = [System.IO.Path]::GetFullPath($sharedRuntime).TrimEnd("\") + "\"
  Get-ChildItem -LiteralPath $sharedRuntime -File -Recurse -Force | ForEach-Object {
    $sourcePath = $_.FullName
    $relativePath = $sourcePath.Substring($sharedPrefix.Length)
    $linkPath = Join-Path $releaseRuntime $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $linkPath) -Force | Out-Null
    try {
      New-Item -ItemType HardLink -Path $linkPath -Target $sourcePath | Out-Null
    } catch {
      Copy-Item -LiteralPath $sourcePath -Destination $linkPath -Force
    }
  }
}

function Install-NgtRuntimeArchive(
  [string]$ArchivePath,
  [string]$ExpectedHash,
  [string]$InstallRoot
) {
  $runtimeRoot = Join-Path $InstallRoot "runtimes"
  $sharedRuntime = Join-Path $runtimeRoot $ExpectedHash
  if (Test-Path -LiteralPath $sharedRuntime) {
    $actualHash = Get-NgtRuntimeHash $sharedRuntime
    if ($actualHash -ne $ExpectedHash) {
      throw "The cached studio runtime is invalid: $ExpectedHash"
    }
    return
  }
  New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
  $stagingRoot = Join-Path $runtimeRoot ("staging-" + [guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
  try {
    & tar.exe -xf $ArchivePath -C $stagingRoot
    if ($LASTEXITCODE -ne 0) { throw "Studio runtime extraction failed." }
    $stagedRuntime = Join-Path $stagingRoot "runtime"
    if (-not (Test-Path -LiteralPath (Join-Path $stagedRuntime "node.exe"))) {
      throw "Studio runtime package is invalid."
    }
    $actualHash = Get-NgtRuntimeHash $stagedRuntime
    if ($actualHash -ne $ExpectedHash) {
      throw "Studio runtime package does not match the application metadata."
    }
    Move-Item -LiteralPath $stagedRuntime -Destination $sharedRuntime
  } finally {
    if (Test-Path -LiteralPath $stagingRoot) {
      Remove-Item -LiteralPath $stagingRoot -Recurse -Force
    }
  }
}

function Remove-NgtUnusedRuntimes([string]$InstallRoot) {
  $releasesRoot = Join-Path $InstallRoot "releases"
  $runtimeRoot = Join-Path $InstallRoot "runtimes"
  if (-not (Test-Path -LiteralPath $runtimeRoot)) { return }
  $usedHashes = @(
    Get-ChildItem -LiteralPath $releasesRoot -Directory -ErrorAction SilentlyContinue |
      ForEach-Object {
        $metadata = Join-Path $_.FullName "studio-release.json"
        if (Test-Path -LiteralPath $metadata) {
          [string](Get-Content -LiteralPath $metadata -Raw | ConvertFrom-Json).runtimeHash
        }
      } | Where-Object { $_ }
  )
  Get-ChildItem -LiteralPath $runtimeRoot -Directory | Where-Object {
    $_.Name -notin $usedHashes
  } | ForEach-Object {
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
  }
}
