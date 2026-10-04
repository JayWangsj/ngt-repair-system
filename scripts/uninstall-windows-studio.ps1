$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "windows-studio-common.ps1")
Stop-NgtStudioProcesses
& (Join-Path $PSScriptRoot "uninstall-windows-startup.ps1")
Write-Output "NGT application files can be removed. Business data was retained."
