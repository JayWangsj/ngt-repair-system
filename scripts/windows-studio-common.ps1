$ErrorActionPreference = "Stop"

$script:NgtTaskName = "NGT Management System"
$script:NgtProjectRoot = Split-Path -Parent $PSScriptRoot
$script:NgtStateDirectory = Join-Path $script:NgtProjectRoot ".local"

function Assert-NgtCommand([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command is not installed: $Name"
  }
}

function Invoke-NgtCommand([string]$Name, [string[]]$Arguments) {
  & $Name @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

function Get-NgtNodeExecutable {
  $releaseNode = Join-Path $script:NgtProjectRoot "runtime\node.exe"
  if (Test-Path -LiteralPath $releaseNode) {
    return $releaseNode
  }
  $bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path -LiteralPath $bundledNode) {
    return $bundledNode
  }
  return (Get-Command node -ErrorAction Stop).Source
}

function Get-NgtGitHubCli {
  $releaseCli = Join-Path $script:NgtProjectRoot "runtime\gh.exe"
  if (Test-Path -LiteralPath $releaseCli) {
    return $releaseCli
  }
  return (Get-Command gh -ErrorAction Stop).Source
}

function Set-NgtStudioEnvironment {
  $configPath = Join-Path $script:NgtStateDirectory "studio.json"
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Studio mode is not installed. Run scripts/install-windows-studio.ps1 first."
  }
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  if (-not $config.dataRoot) {
    throw "Studio configuration is missing dataRoot."
  }
  $env:NGT_DATA_ROOT = [System.IO.Path]::GetFullPath([string]$config.dataRoot)
  return $config
}

function Wait-NgtPort([int]$Port, [bool]$Open) {
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $listening = [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listening -eq $Open) {
      return
    }
    Start-Sleep -Milliseconds 250
  }
  $expected = if ($Open) { "open" } else { "close" }
  throw "Port $Port did not $expected in time."
}

function Stop-NgtStudioProcesses {
  if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
    $task = Get-ScheduledTask -TaskName $script:NgtTaskName -ErrorAction SilentlyContinue
    if ($task) {
      Stop-ScheduledTask -TaskName $script:NgtTaskName -ErrorAction SilentlyContinue
    }
  }

  $stateDirectories = @($script:NgtStateDirectory)
  $releaseParent = Split-Path -Parent $script:NgtProjectRoot
  if ((Split-Path -Leaf $releaseParent) -eq "releases") {
    $stateDirectories += @(Get-ChildItem -LiteralPath $releaseParent -Directory -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName ".local" } |
      Where-Object { Test-Path -LiteralPath $_ })
  }
  $stateDirectories = @($stateDirectories | Select-Object -Unique)

  foreach ($stateDirectory in $stateDirectories) {
    $supervisorFile = Join-Path $stateDirectory "supervisor.pid"
    if (Test-Path -LiteralPath $supervisorFile) {
      [int]$supervisorId = 0
      $supervisorText = (Get-Content -LiteralPath $supervisorFile -Raw).Trim()
      if ([int]::TryParse($supervisorText, [ref]$supervisorId)) {
        Stop-Process -Id $supervisorId -Force -ErrorAction SilentlyContinue
      }
    }
  }
  if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
      Where-Object {
        $_.CommandLine -and
        ($_.CommandLine.IndexOf($releaseParent, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) -and
        ($_.CommandLine.IndexOf("windows-service.ps1", [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
      } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  }

  $applicationConnections = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
  foreach ($processId in @($applicationConnections | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process -and ($process.ProcessName -eq "node")) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }

  $stoppedDatabases = @{}
  foreach ($stateDirectory in $stateDirectories) {
    $runtimeFile = Join-Path $stateDirectory "database-runtime-location.txt"
    $dataFile = Join-Path $stateDirectory "database-location.txt"
    if ((Test-Path -LiteralPath $runtimeFile) -and (Test-Path -LiteralPath $dataFile)) {
      $runtime = (Get-Content -LiteralPath $runtimeFile -Raw).Trim()
      $data = (Get-Content -LiteralPath $dataFile -Raw).Trim()
      $databaseKey = $runtime + "|" + $data
      $pgCtl = Join-Path $runtime "bin\pg_ctl.exe"
      if (-not $stoppedDatabases.ContainsKey($databaseKey) -and (Test-Path -LiteralPath $pgCtl) -and (Test-Path -LiteralPath $data)) {
        $stoppedDatabases[$databaseKey] = $true
        & $pgCtl -D $data -m fast stop 2>$null
      }
    }
  }

  Wait-NgtPort -Port 3000 -Open $false
  Wait-NgtPort -Port 55432 -Open $false
}

function Start-NgtStudioDatabase {
  if ([bool](Get-NetTCPConnection -LocalPort 55432 -State Listen -ErrorAction SilentlyContinue)) {
    throw "Port 55432 is already in use."
  }
  New-Item -ItemType Directory -Path $script:NgtStateDirectory -Force | Out-Null
  $nodeExecutable = Get-NgtNodeExecutable
  $errorLog = Join-Path $script:NgtStateDirectory "studio-database.error.log"
  $process = Start-Process -FilePath $nodeExecutable `
    -ArgumentList "scripts/windows-db.mjs" `
    -WorkingDirectory $script:NgtProjectRoot `
    -RedirectStandardOutput (Join-Path $script:NgtStateDirectory "studio-database.log") `
    -RedirectStandardError $errorLog `
    -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath (Join-Path $script:NgtStateDirectory "database.pid") `
    -Value $process.Id -Encoding ascii
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    if ([bool](Get-NetTCPConnection -LocalPort 55432 -State Listen -ErrorAction SilentlyContinue)) {
      return
    }
    if ($process.HasExited) {
      $details = if (Test-Path -LiteralPath $errorLog) {
        (Get-Content -LiteralPath $errorLog -Raw).Trim()
      }
      if ($details) {
        throw "Database initialization failed: $details"
      }
      throw "Database initialization failed with exit code $($process.ExitCode)."
    }
    Start-Sleep -Milliseconds 250
  }
  throw "Database did not open port 55432 in time."
}

function Start-NgtStudioTask {
  $task = Get-ScheduledTask -TaskName $script:NgtTaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    throw "Windows startup task is not installed."
  }
  Start-ScheduledTask -TaskName $script:NgtTaskName
}

function Wait-NgtStudioHealth {
  $routes = @("http://127.0.0.1:3000/api/health", "http://127.0.0.1:3000/orders")
  foreach ($route in $routes) {
    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      try {
        $response = Invoke-WebRequest -Uri $route -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
          $ready = $true
          break
        }
      } catch {
        Start-Sleep -Seconds 1
      }
    }
    if (-not $ready) {
      throw "Studio verification failed: $route did not return HTTP 200."
    }
  }
}
