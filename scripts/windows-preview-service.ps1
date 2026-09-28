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

while ($true) {
  try {
    Start-NgtProcess -Name "test-database" -Script "scripts/windows-test-db.mjs" -Port 55433
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
    Start-NgtProcess -Name "preview" -Script "scripts/start.mjs" -Port 3236
  } catch {
    Add-Content -LiteralPath (Join-Path $stateDirectory "preview-supervisor.error.log") `
      -Value ((Get-Date -Format o) + " " + $_.Exception.Message)
  }
  Start-Sleep -Seconds 5
}
