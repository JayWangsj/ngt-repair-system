param(
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "NGT")
)
$ErrorActionPreference = "Stop"

$taskName = "NGT Management System"
$launcherScript = Join-Path ([System.IO.Path]::GetFullPath($InstallRoot)) "service\windows-studio-launcher.vbs"
if (-not (Test-Path -LiteralPath $launcherScript)) {
  throw "Stable studio launcher is missing: $launcherScript"
}
$wscriptPath = Join-Path $env:WINDIR "System32\wscript.exe"
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runValueName = "NGT Management System"
$launcherArguments = '//B //Nologo "' + $launcherScript + '"'
$existing = $null
if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) {
    . (Join-Path (Split-Path -Parent $launcherScript) "windows-studio-common.ps1")
    if (-not (Test-NgtStudioScheduledTask -Task $existing -LauncherPath $launcherScript)) {
      throw "The NGT startup task has an unexpected action; refusing to replace it."
    }
  }
}

try {
  $action = New-ScheduledTaskAction -Execute $wscriptPath -Argument $launcherArguments
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (
    New-TimeSpan -Minutes 1
  ) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

  if ($existing) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  }
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Starts and monitors the local NGT database and web application." -Force | Out-Null
  Remove-ItemProperty -LiteralPath $runKey -Name $runValueName -ErrorAction SilentlyContinue
  Start-Process -FilePath $wscriptPath -ArgumentList $launcherArguments -WindowStyle Hidden
  Write-Output "NGT startup task installed and started."
} catch {
  New-Item -Path $runKey -Force | Out-Null
  Set-ItemProperty -LiteralPath $runKey -Name $runValueName -Value ('"' + $wscriptPath + '" ' + $launcherArguments)
  Start-Process -FilePath $wscriptPath -ArgumentList $launcherArguments
  Write-Warning ("Task Scheduler was unavailable; installed the per-user startup fallback. " + $_.Exception.Message)
}
