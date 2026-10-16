$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$stateDirectory = Join-Path $projectRoot ".local"
New-Item -ItemType Directory -Path $stateDirectory -Force | Out-Null
Set-Location -LiteralPath $projectRoot

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (Test-Path -LiteralPath $bundledNode) {
  $nodeExecutable = $bundledNode
} else {
  $nodeExecutable = (Get-Command node -ErrorAction Stop).Source
}

function Get-NgtProcess([int]$Id) {
  return Get-CimInstance -ClassName Win32_Process -Filter ("ProcessId = " + $Id) -ErrorAction Stop
}

function Get-NgtPortConnections([int]$Port) {
  try {
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
  } catch {
    if ($_.FullyQualifiedErrorId -like "CmdletizationQuery_NotFound,*") { return @() }
    throw
  }
}

function Get-NgtPortListeners([int]$Port) {
  $processIds = @(Get-NgtPortConnections -Port $Port |
    Select-Object -ExpandProperty OwningProcess -Unique)
  $listeners = @()
  foreach ($processId in $processIds) {
    $process = Get-NgtProcess -Id $processId
    if (-not $process) {
      $stillListening = @(Get-NgtPortConnections -Port $Port |
        Where-Object { $_.OwningProcess -eq $processId })
      if ($stillListening.Count -gt 0) {
        throw ("Could not identify listener PID " + $processId + " on port " + $Port + "; refusing to start another process.")
      }
      continue
    }
    $listeners += $process
  }
  return $listeners
}

function Test-NgtProcessTree([int]$ProcessId, [int]$AncestorId) {
  $visited = @{}
  $currentId = $ProcessId
  while ($currentId -gt 0 -and -not $visited.ContainsKey($currentId)) {
    if ($currentId -eq $AncestorId) { return $true }
    $visited[$currentId] = $true
    $process = Get-NgtProcess -Id $currentId
    if (-not $process) { return $false }
    $currentId = [int]$process.ParentProcessId
  }
  return $false
}

function Test-NgtProjectSupervisor([int]$ProcessId) {
  $visited = @{}
  $currentId = $ProcessId
  $serviceScript = Join-Path $projectRoot "scripts\windows-preview-service.ps1"
  while ($currentId -gt 0 -and -not $visited.ContainsKey($currentId)) {
    $visited[$currentId] = $true
    $process = Get-NgtProcess -Id $currentId
    if (-not $process) { return $false }
    $commandLine = [string]$process.CommandLine
    if ($process.Name -in @("powershell.exe", "pwsh.exe") -and
      $commandLine.IndexOf($serviceScript, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
      return $true
    }
    $currentId = [int]$process.ParentProcessId
  }
  return $false
}

function Test-NgtListenerOwnership([string]$Name, [int]$ListenerId) {
  $pidPath = Join-Path $stateDirectory ($Name + ".pid")
  if (-not (Test-Path -LiteralPath $pidPath)) { return $false }
  $rootIdText = (Get-Content -LiteralPath $pidPath -Raw).Trim()
  $rootId = 0
  if (-not [int]::TryParse($rootIdText, [ref]$rootId) -or $rootId -le 0) {
    return $false
  }

  $rootProcess = Get-NgtProcess -Id $rootId
  $listener = Get-NgtProcess -Id $ListenerId
  if (-not $rootProcess -or -not $listener -or $rootProcess.Name -ne "node.exe") {
    return $false
  }
  if (-not (Test-NgtProcessTree -ProcessId $ListenerId -AncestorId $rootId)) {
    return $false
  }

  $rootCommandLine = [string]$rootProcess.CommandLine
  $expectedNodePath = [System.IO.Path]::GetFullPath($nodeExecutable)
  if (-not $rootProcess.ExecutablePath -or
    [System.IO.Path]::GetFullPath($rootProcess.ExecutablePath) -ine $expectedNodePath) {
    return $false
  }

  if ($Name -eq "preview") {
    $nextCli = Join-Path $projectRoot "node_modules\next\dist\bin\next"
    $absoluteNextCommand = $rootCommandLine.IndexOf($nextCli, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    $legacyNextCommand = $rootCommandLine -match '(?i)(^|\s)"?node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next"?(\s|$)'
    $projectPathVerified = $rootCommandLine.IndexOf($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      ($legacyNextCommand -and (Test-NgtProjectSupervisor -ProcessId $rootId))
    return ($listener.Name -eq "node.exe" -and
      ($absoluteNextCommand -or $legacyNextCommand) -and
      $projectPathVerified -and
      $rootCommandLine -match '(?i)(^|\s)dev(\s|$)' -and
      $rootCommandLine -match '(?i)--hostname\s+127\.0\.0\.1' -and
      $rootCommandLine -match '(?i)--port\s+3236')
  }

  if ($Name -eq "test-database") {
    $databaseScript = Join-Path $projectRoot "scripts\windows-test-db.mjs"
    $absoluteDatabaseCommand = $rootCommandLine.IndexOf($databaseScript, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    $legacyDatabaseCommand = $rootCommandLine -match '(?i)(^|\s)"?scripts[\\/]windows-test-db\.mjs"?(\s|$)'
    $projectPathVerified = $rootCommandLine.IndexOf($projectRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      ($legacyDatabaseCommand -and (Test-NgtProjectSupervisor -ProcessId $rootId))
    if ((-not $absoluteDatabaseCommand -and -not $legacyDatabaseCommand) -or
      -not $projectPathVerified -or
      $listener.Name -ne "postgres.exe" -or
      $listener.CommandLine -notmatch '(?i)(^|\s)-p\s+55510(\s|$)') {
      return $false
    }

    $locationPath = Join-Path $stateDirectory "test-database-location.txt"
    if (Test-Path -LiteralPath $locationPath) {
      $databaseDirectory = Join-Path ((Get-Content -LiteralPath $locationPath -Raw).Trim()) "data"
      return $listener.CommandLine.IndexOf($databaseDirectory, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    }
    return $listener.ExecutablePath -match '(?i)\\ngt-test-pg-[a-f0-9]{10}\\runtime\\bin\\postgres\.exe$' -and
      $listener.CommandLine -match '(?i)-D\s+"?[^"\r\n]*\\ngt-test-pg-[a-f0-9]{10}\\data'
  }

  return $false
}

function Test-NgtServiceHealth([string]$Name) {
  if ($Name -eq "test-database") {
    $locationPath = Join-Path $stateDirectory "test-database-location.txt"
    if (-not (Test-Path -LiteralPath $locationPath)) { return $false }
    $databaseDirectory = Join-Path ((Get-Content -LiteralPath $locationPath -Raw).Trim()) "data"
    $pgCtl = Join-Path (Split-Path -Parent $databaseDirectory) "runtime\bin\pg_ctl.exe"
    if (-not (Test-Path -LiteralPath $pgCtl)) { return $false }
    & $pgCtl -D $databaseDirectory status *> $null
    if ($LASTEXITCODE -ne 0) { return $false }
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
      $client.Connect("127.0.0.1", 55510)
      return $client.Connected
    } catch {
      return $false
    } finally {
      $client.Dispose()
    }
  }

  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:3236/api/health" `
      -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    return $response.StatusCode -eq 200 -and $response.Content -match '"status"\s*:\s*"ok"'
  } catch {
    return $false
  }
}

function Start-NgtProcess([string]$Name, [string]$Script, [string]$Arguments, [int]$Port) {
  $listeners = @(Get-NgtPortListeners -Port $Port)
  if ($listeners.Count -gt 0) {
    foreach ($listener in $listeners) {
      if (-not (Test-NgtListenerOwnership -Name $Name -ListenerId $listener.ProcessId)) {
        throw ($Name + " port " + $Port + " is owned by unrecognized PID " + $listener.ProcessId + "; refusing to reuse or stop it.")
      }
    }
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
      if (Test-NgtServiceHealth -Name $Name) { return }
      Start-Sleep -Milliseconds 250
    }
    throw ($Name + " port " + $Port + " belongs to this project but failed its health check.")
  }

  $argumentLine = '"' + $Script + '"'
  if ($Arguments) { $argumentLine += " " + $Arguments }
  $process = Start-Process -FilePath $nodeExecutable -ArgumentList $argumentLine `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput (Join-Path $stateDirectory ($Name + ".log")) `
    -RedirectStandardError (Join-Path $stateDirectory ($Name + ".error.log")) `
    -WindowStyle Hidden -PassThru

  Set-Content -LiteralPath (Join-Path $stateDirectory ($Name + ".pid")) -Value $process.Id -Encoding ascii
  for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $listeners = @(Get-NgtPortListeners -Port $Port)
    if ($listeners.Count -gt 0) {
      foreach ($listener in $listeners) {
        if (-not (Test-NgtListenerOwnership -Name $Name -ListenerId $listener.ProcessId)) {
          throw ($Name + " port " + $Port + " is owned by unrecognized PID " + $listener.ProcessId + "; refusing to reuse or stop it.")
        }
      }
      if (Test-NgtServiceHealth -Name $Name) { return }
    }
    $process.Refresh()
    if ($process.HasExited) { throw ($Name + " exited before passing its port and health checks.") }
    Start-Sleep -Milliseconds 250
  }
  throw ($Name + " did not pass its port and health checks in time.")
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
      $environmentFile = Join-Path $stateDirectory "test.env"
      if (-not (Test-Path -LiteralPath $environmentFile)) {
        throw "Missing .local/test.env."
      }
      $testEnvironment = @{}
      Get-Content -LiteralPath $environmentFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
          $testEnvironment[$matches[1]] = $matches[2].Trim().Trim('"')
        }
      }
      foreach ($databaseVariable in @("DATABASE_URL", "DIRECT_URL")) {
        if (-not $testEnvironment.ContainsKey($databaseVariable)) {
          if ($databaseVariable -eq "DATABASE_URL") { throw "Missing DATABASE_URL in .local/test.env." }
          continue
        }
        $databaseUrl = [System.Uri]$testEnvironment[$databaseVariable]
        if ($databaseUrl.Scheme -notin @("postgres", "postgresql") -or
          $databaseUrl.Host -ne "127.0.0.1" -or
          $databaseUrl.Port -ne 55510 -or
          $databaseUrl.AbsolutePath.Trim("/") -ne "ngt_test") {
          throw ($databaseVariable + " must target ngt_test on 127.0.0.1:55510; refusing to start the preview.")
        }
      }
      foreach ($name in $testEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $testEnvironment[$name], "Process")
      }
      if (-not $testEnvironment.ContainsKey("DIRECT_URL")) {
        $env:DIRECT_URL = $env:DATABASE_URL
      }
      Start-NgtProcess -Name "test-database" `
        -Script (Join-Path $projectRoot "scripts\windows-test-db.mjs") -Arguments "" -Port 55510
      $env:PORT = "3236"
      $env:HOSTNAME = "127.0.0.1"
      $env:AUTH_URL = "http://127.0.0.1:3236"
      $env:AUTH_TRUST_HOST = "true"
      $env:NGT_TEST_TOOLS = "true"
      Start-NgtProcess -Name "preview" `
        -Script (Join-Path $projectRoot "node_modules\next\dist\bin\next") `
        -Arguments ('dev --hostname 127.0.0.1 --port 3236 "' + $projectRoot + '"') -Port 3236
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
