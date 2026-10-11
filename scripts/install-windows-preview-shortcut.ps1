$ErrorActionPreference = "Stop"

$sourcePath = (Resolve-Path (Join-Path $PSScriptRoot "windows-preview-desktop-launcher.cs")).Path
$iconPath = (Resolve-Path (Join-Path $PSScriptRoot "..\assets\ngt-studio.ico")).Path
$installDirectory = Join-Path $env:LOCALAPPDATA "NGT\TestPreview"
$launcherPath = Join-Path $installDirectory "NGT-Test-Launcher.exe"
$desktopName = "NGT " + (-join [char[]](0x6D4B, 0x8BD5, 0x7CFB, 0x7EDF))
$desktopPath = [Environment]::GetFolderPath("Desktop")
$desktopLauncherPath = Join-Path $desktopPath ($desktopName + ".exe")
$legacyShortcutPath = Join-Path $desktopPath ($desktopName + ".lnk")
$compilerPath = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if (-not (Test-Path -LiteralPath $compilerPath)) {
  throw "Windows C# compiler was not found: $compilerPath"
}

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
& $compilerPath /nologo /target:winexe /optimize+ "/win32icon:$iconPath" "/out:$launcherPath" $sourcePath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $launcherPath)) {
  throw "Failed to build the NGT test preview launcher."
}

Copy-Item -LiteralPath $launcherPath -Destination $desktopLauncherPath -Force
if (Test-Path -LiteralPath $legacyShortcutPath) {
  Remove-Item -LiteralPath $legacyShortcutPath -Force
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NgtShellRefresh {
  [DllImport("shell32.dll")]
  public static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2);
}
"@
[NgtShellRefresh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Output "NGT test preview desktop launcher installed: $desktopLauncherPath"
