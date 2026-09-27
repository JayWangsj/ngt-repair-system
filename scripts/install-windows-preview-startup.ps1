$ErrorActionPreference = "Stop"

$taskName = "NGT Test Preview"
$serviceScript = (Resolve-Path (Join-Path $PSScriptRoot "windows-preview-service.ps1")).Path
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

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Starts and monitors the isolated NGT test preview." -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "NGT test preview startup task installed and started."
