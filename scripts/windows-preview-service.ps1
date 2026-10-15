$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$stateDirectory = Join-Path $projectRoot ".local"
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
Set-Location -LiteralPath $projectRoot

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (Test-Path -LiteralPath $bundledNode) {
  $nodeExecutable = $bundledNode
} else {
  $nodeExecutable = (Get-Command node -ErrorAction Stop).Source
}

function Test-ListeningPort([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Start-NgtProcess([string]$Name, [string]$Script, [int]$Port) {
  if (Test-ListeningPort $Port) { return }

  $process = Start-Process -FilePath $nodeExecutable -ArgumentList $Script `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput (Join-Path $stateDirectory ($Name + ".log")) `
    -RedirectStandardError (Join-Path $stateDirectory ($Name + ".error.log")) `
    -WindowStyle Hidden -PassThru

  Set-Content -LiteralPath (Join-Path $stateDirectory ($Name + ".pid")) -Value $process.Id -Encoding ascii
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    if (Test-ListeningPort $Port) { return }
    if ($process.HasExited) { throw ($Name + " exited before port " + $Port + " was ready.") }
    Start-Sleep -Milliseconds 250
  }
  throw ($Name + " did not open port " + $Port + " in time.")
}

function Get-PreviewBuildId {
  $buildIdPath = Join-Path $projectRoot ".next\BUILD_ID"
  if (-not (Test-Path -LiteralPath $buildIdPath)) { return "" }
  return (Get-Content -LiteralPath $buildIdPath -Raw).Trim()
}

function Restart-PreviewWhenBuildChanges([string]$BuildId) {
  if (-not $BuildId -or -not (Test-ListeningPort 3236)) { return }

  $activeBuildPath = Join-Path $stateDirectory "preview-build-id.txt"
  $activeBuildId = ""
  if (Test-Path -LiteralPath $activeBuildPath) {
    $activeBuildId = (Get-Content -LiteralPath $activeBuildPath -Raw).Trim()
  }
  if ($activeBuildId -eq $BuildId) { return }

  $listeners = Get-NetTCPConnection -LocalPort 3236 -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $listener.OwningProcess)
    if (-not $process -or $process.Name -ne "node.exe" -or $process.CommandLine -notmatch "(?i)\.next[\\/]standalone[\\/]server\.js") {
      throw "Port 3236 is owned by an unexpected process; refusing to restart it."
    }
    Stop-Process -Id $listener.OwningProcess -Force
  }

  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if (-not (Test-ListeningPort 3236)) { return }
    Start-Sleep -Milliseconds 250
  }
  throw "Preview did not release port 3236 after a build change."
}

$mutex = [System.Threading.Mutex]::new($false, "Global\NGT-Test-Preview-Service")
$ownsMutex = $false
try {
  $ownsMutex = $mutex.WaitOne(0)
} catch [System.Threading.AbandonedMutexException] {
  $ownsMutex = $true
}
if (-not $ownsMutex) {
  $mutex.Dispose()
  exit 0
}

try {
  while ($true) {
    try {
      Start-NgtProcess -Name "test-database" -Script "scripts/windows-test-db.mjs" -Port 55510
      $environmentFile = Join-Path $stateDirectory "test.env"
      if (-not (Test-Path -LiteralPath $environmentFile)) {
        throw "Missing .local/test.env."
      }
      Get-Content -LiteralPath $environmentFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
          [Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim('"'), "Process")
        }
      }
      $env:PORT = "3236"
      $env:HOSTNAME = "127.0.0.1"
      $env:AUTH_URL = "http://127.0.0.1:3236"
      $env:AUTH_TRUST_HOST = "true"
      $env:NGT_TEST_TOOLS = "true"
      $buildId = Get-PreviewBuildId
      Restart-PreviewWhenBuildChanges -BuildId $buildId
      Start-NgtProcess -Name "preview" -Script "scripts/start.mjs" -Port 3236
      if ($buildId) {
        Set-Content -LiteralPath (Join-Path $stateDirectory "preview-build-id.txt") -Value $buildId -Encoding ascii
      }
    } catch {
      Add-Content -LiteralPath (Join-Path $stateDirectory "preview-supervisor.error.log") `
        -Value ((Get-Date -Format o) + " " + $_.Exception.Message)
    }
    Start-Sleep -Seconds 5
  }
} finally {
  $mutex.ReleaseMutex()
  $mutex.Dispose()
}
