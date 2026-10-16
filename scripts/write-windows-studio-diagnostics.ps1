param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("online-update", "installer-acceptance")]
  [string]$Stage,
  [Parameter(Mandatory = $true)]
  [string]$Tag,
  [Parameter(Mandatory = $true)]
  [string]$Commit,
  [string]$Version = "",
  [string]$Message = "",
  [string[]]$SourcePaths = @(),
  [string]$OutputDirectory = (Join-Path $env:RUNNER_TEMP ("ngt-" + $Stage + "-diagnostics"))
)
$ErrorActionPreference = "Stop"

function Protect-DiagnosticText([string]$Text) {
  $safe = $Text
  $safe = [regex]::Replace($safe, "(?is)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", "[REDACTED PRIVATE KEY]")
  $safe = [regex]::Replace($safe, '(?i)(password|secret|token|authorization)(\s*[:=]\s*)[^\s,;"]+', '$1$2[REDACTED]')
  $safe = [regex]::Replace($safe, "(?i)(postgres(?:ql)?://)[^:/\s]+:[^@/\s]+@", '$1[REDACTED]@')
  $safe = [regex]::Replace($safe, "(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+", "Bearer [REDACTED]")
  if ($safe.Length -gt 700000) { $safe = $safe.Substring($safe.Length - 700000) }
  return $safe
}

if ($Tag -notmatch '^v\d+\.\d+\.\d+$' -or $Commit -notmatch '^[a-fA-F0-9]{40}$') {
  throw "Refusing to write diagnostics with invalid release identity."
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
foreach ($sourcePath in $SourcePaths) {
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { continue }
  $name = switch ($Stage) {
    "online-update" {
      if ((Split-Path -Leaf $sourcePath) -eq "online-update.log") { "online-update.log" }
      elseif ((Split-Path -Leaf $sourcePath) -eq "update-status.json") { "update-status.json" }
      else { $null }
    }
    "installer-acceptance" {
      if ((Split-Path -Leaf $sourcePath) -eq "installer.log") { "installer.log" }
      else { $null }
    }
  }
  if (-not $name) { continue }
  $text = Protect-DiagnosticText ([System.IO.File]::ReadAllText($sourcePath))
  [System.IO.File]::WriteAllText((Join-Path $OutputDirectory $name), $text, [System.Text.UTF8Encoding]::new($false))
}
$summary = [ordered]@{
  stage = $Stage
  tag = $Tag
  version = $Version
  commit = $Commit.ToLowerInvariant()
  runId = $env:GITHUB_RUN_ID
  runnerOs = $env:RUNNER_OS
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  message = Protect-DiagnosticText $Message
}
[System.IO.File]::WriteAllText(
  (Join-Path $OutputDirectory "summary.json"),
  ($summary | ConvertTo-Json -Depth 4),
  [System.Text.UTF8Encoding]::new($false)
)
