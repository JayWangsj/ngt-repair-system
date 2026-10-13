$ErrorActionPreference = "Stop"

$installRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $installRoot ".local"
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
Set-Content -LiteralPath (Join-Path $stateDirectory "supervisor.pid") -Value $PID -Encoding ascii

$studioConfigPath = Join-Path $stateDirectory "studio.json"
if (Test-Path -LiteralPath $studioConfigPath) {
  $studioConfig = Get-Content -LiteralPath $studioConfigPath -Raw | ConvertFrom-Json
  if (-not $studioConfig.dataRoot -or -not $studioConfig.activeRelease) {
    throw "Studio configuration is missing dataRoot or activeRelease."
  }
  $env:NGT_DATA_ROOT = [System.IO.Path]::GetFullPath([string]$studioConfig.dataRoot)
  $projectRoot = [System.IO.Path]::GetFullPath([string]$studioConfig.activeRelease)
} else {
  throw "Studio configuration is missing. Run scripts/install-windows-studio.ps1 first."
}
Set-Location -LiteralPath $projectRoot

$releaseNode = Join-Path $projectRoot "runtime\node.exe"
$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (Test-Path -LiteralPath $releaseNode) {
  $nodeExecutable = $releaseNode
} elseif (Test-Path -LiteralPath $bundledNode) {
  $nodeExecutable = $bundledNode
} else {
  $nodeCommand = Get-Command node -ErrorAction Stop
  $nodeExecutable = $nodeCommand.Source
}

function Test-ListeningPort([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-NgtProcess(
  [string]$Name,
  [string]$Script,
  [int]$Port
) {
  if (Test-ListeningPort $Port) {
    return
  }

  $stdoutPath = Join-Path $stateDirectory ($Name + ".log")
  $stderrPath = Join-Path $stateDirectory ($Name + ".error.log")
  $startOptions = @{
    FilePath = $nodeExecutable
    ArgumentList = $Script
    WorkingDirectory = $projectRoot
    RedirectStandardOutput = $stdoutPath
    RedirectStandardError = $stderrPath
    WindowStyle = "Hidden"
    PassThru = $true
  }
  $process = Start-Process @startOptions
  Set-Content -LiteralPath (Join-Path $stateDirectory ($Name + ".pid")) -Value $process.Id -Encoding ascii

  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    if (Test-ListeningPort $Port) {
      return
    }
    if ($process.HasExited) {
      throw ($Name + " exited before port " + $Port + " was ready.")
    }
    Start-Sleep -Milliseconds 250
  }
  throw ($Name + " did not open port " + $Port + " in time.")
}

while ($true) {
  try {
    Start-NgtProcess -Name "database" -Script "scripts/windows-db.mjs" -Port 55432
    Start-NgtProcess -Name "application" -Script "scripts/start.mjs" -Port 3000
  } catch {
    $line = (Get-Date -Format o) + " " + $_.Exception.Message
    Add-Content -LiteralPath (Join-Path $stateDirectory "supervisor.error.log") -Value $line
  }
  Start-Sleep -Seconds 5
}
