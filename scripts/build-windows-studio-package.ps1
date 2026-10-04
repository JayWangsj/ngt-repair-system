param(
  [string]$OutputDirectory = "dist",
  [string]$BuildDirectory = ".next"
)
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$standaloneBuild = Join-Path $BuildDirectory "standalone"
if (-not (Test-Path -LiteralPath (Join-Path $standaloneBuild "server.js"))) {
  throw "Production build is missing. Run pnpm build first."
}

$package = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
$version = $package.version
$commitOutput = git rev-parse HEAD
if (($LASTEXITCODE -ne 0) -or (-not $commitOutput)) { throw "Unable to read the Git commit." }
$commit = ($commitOutput | Out-String).Trim()
if ($env:GITHUB_REF_NAME -and ($env:GITHUB_REF_NAME -ne ("v" + $version))) {
  throw "Git tag $env:GITHUB_REF_NAME does not match package version v$version."
}

$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))
$stage = Join-Path $projectRoot ".local\studio-package"
if (Test-Path -LiteralPath $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path (Join-Path $stage ".next") -Force | Out-Null
$standaloneDestination = Join-Path $stage ".next\standalone"
& robocopy.exe $standaloneBuild $standaloneDestination /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) {
  throw "Standalone build copy failed with exit code $LASTEXITCODE."
}
Copy-Item -LiteralPath (Join-Path $BuildDirectory "static") -Destination (Join-Path $stage ".next\static") -Recurse -Force
$copiedEnvironment = Join-Path $stage ".next\standalone\.env"
if (Test-Path -LiteralPath $copiedEnvironment) {
  Remove-Item -LiteralPath $copiedEnvironment -Force
}
Copy-Item -LiteralPath "prisma" -Destination (Join-Path $stage "prisma") -Recurse -Force
$stageAssets = Join-Path $stage "assets"
New-Item -ItemType Directory -Path $stageAssets -Force | Out-Null
Copy-Item -LiteralPath "assets\ngt-studio.ico" -Destination $stageAssets -Force

$runtimeScripts = @(
  "backup-windows-studio.ps1",
  "install-windows-startup.ps1",
  "install-windows-studio.ps1",
  "start.mjs",
  "uninstall-windows-startup.ps1",
  "uninstall-windows-studio.ps1",
  "update-windows-studio.ps1",
  "windows-db.mjs",
  "windows-service.ps1",
  "windows-studio-launcher.vbs",
  "windows-studio-common.ps1"
)
$stageScripts = Join-Path $stage "scripts"
New-Item -ItemType Directory -Path $stageScripts -Force | Out-Null
foreach ($scriptName in $runtimeScripts) {
  Copy-Item -LiteralPath (Join-Path "scripts" $scriptName) -Destination $stageScripts -Force
}

$runtimeDefinition = Join-Path $projectRoot "scripts\studio-runtime"
Copy-Item -LiteralPath (Join-Path $runtimeDefinition "package.json") `
  -Destination (Join-Path $stage "package.json") -Force
$dependencyStage = Join-Path ([System.IO.Path]::GetTempPath()) ("ngt-studio-runtime-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $dependencyStage -Force | Out-Null
try {
  Get-ChildItem -LiteralPath $runtimeDefinition -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $dependencyStage -Force
  }
  Push-Location -LiteralPath $dependencyStage
  try {
    & pnpm install --prod --frozen-lockfile `
      --config.node-linker=hoisted --config.package-import-method=copy
    if ($LASTEXITCODE -ne 0) { throw "Runtime dependency installation failed." }
  } finally {
    Pop-Location
  }
  Copy-Item -LiteralPath (Join-Path $dependencyStage "node_modules") `
    -Destination (Join-Path $stage "node_modules") -Recurse -Force
} finally {
  if (Test-Path -LiteralPath $dependencyStage) {
    Remove-Item -LiteralPath $dependencyStage -Recurse -Force
  }
}

$nativePackage = Get-ChildItem -LiteralPath "node_modules\.pnpm" -Directory `
  -Filter "@embedded-postgres+windows-x64@*" | Select-Object -First 1
if (-not $nativePackage) {
  throw "Windows PostgreSQL runtime is missing."
}
$nativeSource = Join-Path $nativePackage.FullName "node_modules\@embedded-postgres\windows-x64\native"
$runtimeDirectory = Join-Path $stage "runtime"
New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
Copy-Item -LiteralPath $nativeSource -Destination (Join-Path $runtimeDirectory "postgres") -Recurse -Force
Copy-Item -LiteralPath (Get-Command node -ErrorAction Stop).Source `
  -Destination (Join-Path $runtimeDirectory "node.exe") -Force
$githubCli = (Get-Command gh -ErrorAction Stop).Source
Copy-Item -LiteralPath $githubCli `
  -Destination (Join-Path $runtimeDirectory "gh.exe") -Force
$licenseDirectory = Join-Path $stage "licenses"
New-Item -ItemType Directory -Path $licenseDirectory -Force | Out-Null
Copy-Item -LiteralPath "licenses\github-cli.txt" `
  -Destination $licenseDirectory -Force

@{
  version = $version
  commit = $commit
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage "studio-release.json") -Encoding utf8

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
$archive = Join-Path $outputRoot ("ngt-studio-windows-v" + $version + ".zip")
if (Test-Path -LiteralPath $archive) {
  Remove-Item -LiteralPath $archive -Force
}
Push-Location -LiteralPath $stage
try {
  & tar.exe -a -c -f $archive .
  if ($LASTEXITCODE -ne 0) { throw "Studio archive creation failed." }
} finally {
  Pop-Location
}
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
Set-Content -LiteralPath ($archive + ".sha256") -Value ("$hash  " + (Split-Path $archive -Leaf)) -Encoding ascii
Write-Output $archive
