param(
  [string]$ArchivePath,
  [switch]$IntegrityOnly
)
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
if (-not $ArchivePath) {
  $ArchivePath = Join-Path $projectRoot ("dist\ngt-studio-windows-v" + $package.version + ".zip")
}
$ArchivePath = [System.IO.Path]::GetFullPath($ArchivePath)
if (-not (Test-Path -LiteralPath $ArchivePath)) {
  throw "Studio package is missing: $ArchivePath"
}
foreach ($port in @(3000, 55432)) {
  if ([bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
    throw "Studio smoke-test port is already in use: $port"
  }
}

$smokeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ngt-studio-smoke-" + [guid]::NewGuid())
$releaseRoot = Join-Path $smokeRoot "release"
$dataRoot = Join-Path $smokeRoot "data"
New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null

function Write-SmokeLogs {
  $stateDirectory = Join-Path $releaseRoot ".local"
  if (-not (Test-Path -LiteralPath $stateDirectory)) { return }
  Get-ChildItem -LiteralPath $stateDirectory -File -Filter "*.log" | ForEach-Object {
    Write-Output ("--- " + $_.Name + " ---")
    Get-Content -LiteralPath $_.FullName -Tail 200
  }
}

try {
  & tar.exe -xf $ArchivePath -C $releaseRoot
  if ($LASTEXITCODE -ne 0) { throw "Studio package extraction failed." }
  & (Join-Path $releaseRoot "scripts\verify-windows-studio-release.ps1") `
    -ReleaseRoot $releaseRoot -ExpectedVersion ([string]$package.version) | Out-Null
  & (Join-Path $releaseRoot "scripts\test-windows-studio-update-safety.ps1")

  $env:NGT_DATA_ROOT = $dataRoot
  Set-Location -LiteralPath $releaseRoot
  . (Join-Path $releaseRoot "scripts\windows-studio-common.ps1")

  & (Join-Path $releaseRoot "scripts\check-windows-credential-store.ps1") | Out-Null

  if ($IntegrityOnly) {
    $nodeExecutable = Get-NgtNodeExecutable
    Invoke-NgtCommand $nodeExecutable @("--version")
    Invoke-NgtCommand $nodeExecutable @("-e", "require('pg');")
    foreach ($requiredPath in @(
      "node_modules\prisma\build\index.js",
      ".next\standalone\node_modules\.prisma\client\default.js",
      ".next\standalone\node_modules\@prisma\client\runtime\library.js"
    )) {
      if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot $requiredPath))) {
        throw "Studio package is missing runtime file: $requiredPath"
      }
    }
    Push-Location -LiteralPath (Join-Path $releaseRoot ".next\standalone")
    $previousPrismaPackage = $env:NGT_PRISMA_PACKAGE
    $env:NGT_PRISMA_PACKAGE = "@prisma/client"
    try {
      Invoke-NgtCommand $nodeExecutable @(
        "-e",
        'const { PrismaClient } = require(process.env.NGT_PRISMA_PACKAGE); const db = new PrismaClient(); db.$disconnect();'
      )
    } finally {
      if ($null -eq $previousPrismaPackage) {
        Remove-Item Env:\NGT_PRISMA_PACKAGE -ErrorAction SilentlyContinue
      } else {
        $env:NGT_PRISMA_PACKAGE = $previousPrismaPackage
      }
      Pop-Location
    }

    $postgresBin = Join-Path $releaseRoot "runtime\postgres\bin"
    foreach ($executable in @("postgres.exe", "pg_ctl.exe")) {
      Invoke-NgtCommand (Join-Path $postgresBin $executable) @("--version")
    }
    $validationData = Join-Path $smokeRoot "validation-data"
    $passwordFile = Join-Path $smokeRoot "validation-password.txt"
    Set-Content -LiteralPath $passwordFile -Value "ci-validation-password" -Encoding ascii
    Invoke-NgtCommand (Join-Path $postgresBin "initdb.exe") @(
      "-D", $validationData,
      "-U", "ngt",
      "--auth=scram-sha-256",
      "--locale=C",
      "--encoding=UTF8",
      "--pwfile=$passwordFile"
    )
    Write-Output "Studio package integrity test passed."
    return
  }

  Start-NgtStudioDatabase

  $nodeExecutable = Get-NgtNodeExecutable
  $prismaCli = Join-Path $releaseRoot "node_modules\prisma\build\index.js"
  Invoke-NgtCommand $nodeExecutable @($prismaCli, "migrate", "deploy")

  $applicationLog = Join-Path $releaseRoot ".local\application.log"
  $applicationErrorLog = Join-Path $releaseRoot ".local\application.error.log"
  $application = Start-Process -FilePath $nodeExecutable `
    -ArgumentList "scripts/start.mjs" `
    -WorkingDirectory $releaseRoot `
    -RedirectStandardOutput $applicationLog `
    -RedirectStandardError $applicationErrorLog `
    -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath (Join-Path $releaseRoot ".local\application.pid") `
    -Value $application.Id -Encoding ascii

  Wait-NgtStudioHealth
  $githubCli = Get-NgtGitHubCli
  $authHelp = & $githubCli auth login --help | Out-String
  if (($LASTEXITCODE -ne 0) -or
      (-not $authHelp.Contains("--web")) -or
      (-not $authHelp.Contains("--clipboard"))) {
    throw "Bundled GitHub CLI does not support browser device authorization."
  }
  $authStatus = Invoke-RestMethod `
    -Uri "http://127.0.0.1:3000/api/system-update/auth" `
    -Method Get `
    -Headers @{ Origin = "http://127.0.0.1:3000"; "Sec-Fetch-Site" = "same-origin" } `
    -TimeoutSec 35
  if ($authStatus.status -ne "idle") {
    throw "Studio package GitHub authorization status endpoint is not ready."
  }
  $updateInfo = Invoke-RestMethod `
    -Uri "http://127.0.0.1:3000/api/system-update" `
    -Method Get `
    -Headers @{ Origin = "http://127.0.0.1:3000"; "Sec-Fetch-Site" = "same-origin" } `
    -TimeoutSec 35
  if (-not $updateInfo.installed) {
    throw "Studio package update check did not recognize the installed release."
  }
  Write-Output "Studio package smoke test passed."
} catch {
  Write-Output "--- Archive bootstrap entries ---"
  & tar.exe -tf $ArchivePath | Where-Object { $_ -match "install-windows-studio-bootstrap" }
  $releaseScripts = Join-Path $releaseRoot "scripts"
  if (Test-Path -LiteralPath $releaseScripts -PathType Container) {
    Write-Output "--- Extracted release scripts ---"
    Get-ChildItem -LiteralPath $releaseScripts -File -Force | ForEach-Object { $_.Name }
  }
  Write-SmokeLogs
  throw
} finally {
  if (Test-Path -LiteralPath (Join-Path $releaseRoot "scripts\windows-studio-common.ps1")) {
    try { Stop-NgtStudioProcesses } catch { Write-Warning $_.Exception.Message }
  }
  Set-Location -LiteralPath $projectRoot
  Remove-Item -LiteralPath $smokeRoot -Recurse -Force -ErrorAction SilentlyContinue
}
