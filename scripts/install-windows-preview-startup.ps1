$ErrorActionPreference = "Stop"

$taskName = "NGT Test Preview"
$launcherScript = (Resolve-Path (Join-Path $PSScriptRoot "windows-preview-launcher.vbs")).Path

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
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Starts and monitors the isolated NGT test preview." -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "NGT test preview startup task installed and started."
