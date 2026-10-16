param(
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "NGT")
)
$ErrorActionPreference = "Stop"

$taskName = "NGT Management System"
$runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runValueName = "NGT Management System"
$launcherPath = Join-Path ([System.IO.Path]::GetFullPath($InstallRoot)) "service\windows-studio-launcher.vbs"
$wscriptPath = Join-Path $env:WINDIR "System32\wscript.exe"
if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($task) {
    . (Join-Path (Split-Path -Parent $launcherPath) "windows-studio-common.ps1")
    if (-not (Test-NgtStudioScheduledTask -Task $task -LauncherPath $launcherPath)) {
      throw "The NGT startup task has an unexpected action; refusing to remove it."
    }
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
}
$runProperties = Get-ItemProperty -LiteralPath $runKey -ErrorAction SilentlyContinue
$runEntry = $runProperties.PSObject.Properties[$runValueName]
if ($runEntry) {
  $expectedRunValue = '"' + $wscriptPath + '" //B //Nologo "' + $launcherPath + '"'
  if ([string]$runEntry.Value -ine $expectedRunValue) {
    throw "The NGT startup registry entry has an unexpected command; refusing to remove it."
  }
  Remove-ItemProperty -LiteralPath $runKey -Name $runValueName -ErrorAction SilentlyContinue
}
Write-Output "NGT startup task removed."
