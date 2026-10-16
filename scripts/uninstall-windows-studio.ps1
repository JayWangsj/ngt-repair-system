$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "windows-studio-common.ps1")
$studioConfig = Set-NgtStudioEnvironment
Stop-NgtStudioProcesses
& (Join-Path $PSScriptRoot "uninstall-windows-startup.ps1") -InstallRoot ([string]$studioConfig.installRoot)
Remove-Item -LiteralPath (Join-Path $script:NgtStateDirectory "studio.json") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path (Split-Path -Parent $script:NgtStateDirectory) "releases") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path (Split-Path -Parent $script:NgtStateDirectory) "runtimes") -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "NGT application files can be removed. Business data was retained."
