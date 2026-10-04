$ErrorActionPreference = "Stop"

$taskName = "NGT Management System"
$serviceScript = (Resolve-Path (Join-Path $PSScriptRoot "windows-service.ps1")).Path
[void][scriptblock]::Create((Get-Content -LiteralPath $serviceScript -Raw))

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (
  '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
  $serviceScript +
  '"'
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
