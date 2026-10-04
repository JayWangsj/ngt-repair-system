$ErrorActionPreference = "Stop"

$taskName = "NGT Management System"
$launcherScript = (Resolve-Path (Join-Path $PSScriptRoot "windows-studio-launcher.vbs")).Path

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument (
  '//B //Nologo "' + $launcherScript + '"'
)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (
  New-TimeSpan -Minutes 1
) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Starts and monitors the local NGT database and web application." -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "NGT startup task installed and started."
