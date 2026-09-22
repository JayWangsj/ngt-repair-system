param([switch]$Repair)
$ErrorActionPreference = 'Stop'
$projectPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$gitPath = Join-Path $projectPath '.git'
$gitItem = Get-Item -LiteralPath $gitPath -Force
if (-not $gitItem.PSIsContainer -or ($gitItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  throw 'Expected a real .git directory in this project; links and worktree files are not supported.'
}
$before = Get-Acl -LiteralPath $gitPath
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$expectedOwner = (Get-Acl -LiteralPath $projectPath).GetOwner([Security.Principal.SecurityIdentifier]).Value
$actualOwner = $before.GetOwner([Security.Principal.SecurityIdentifier]).Value
if (-not $Repair) {
  [pscustomobject]@{ Path = $gitPath; Owner = $before.Owner; OwnerSid = $actualOwner; ExpectedOwnerSid = $expectedOwner; NeedsRepair = ($actualOwner -ne $expectedOwner) } | ConvertTo-Json
  exit 0
}
if ($actualOwner -eq $expectedOwner) { Write-Output 'Owner already matches the project owner.'; exit 0 }
if ($before.Owner -notmatch '\\CodexSandbox(Offline|Online)$') { throw 'Unexpected owner; refusing automatic repair.' }
if ($currentIdentity.User.Value -ne $expectedOwner) { throw 'Run as the project owner, not a different administrator account.' }
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator elevation is required to restore ownership.' }
$statePath = Join-Path $projectPath '.local'
New-Item -ItemType Directory -Path $statePath -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $statePath ('codex-git-acl-before-' + $stamp + '.json')
[pscustomobject]@{ Path = $gitPath; Sddl = $before.Sddl; Owner = $before.Owner } | ConvertTo-Json | Set-Content -LiteralPath $backupPath -Encoding UTF8
$logPath = Join-Path $statePath 'codex-sandbox-repair.log'
Start-Transcript -Path $logPath -Force | Out-Null
try {
  # Only this directory. Preserve all access rules and all child files.
  & "$env:SystemRoot\System32\takeown.exe" /F $gitPath
  if ($LASTEXITCODE -ne 0) { throw 'Ownership repair failed.' }
  $after = Get-Acl -LiteralPath $gitPath
  if ($after.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $expectedOwner) { throw 'Owner verification failed.' }
  $section = [Security.AccessControl.AccessControlSections]::Access
  if ($after.GetSecurityDescriptorSddlForm($section) -ne $before.GetSecurityDescriptorSddlForm($section)) { throw 'Access rules changed unexpectedly; review the saved ACL backup.' }
  Write-Output 'Repair verified: project owner restored, access rules unchanged.'
} finally { Stop-Transcript | Out-Null }
