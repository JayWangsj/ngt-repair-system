param(
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot,
  [Parameter(Mandatory = $true)]
  [string]$CurrentReleaseRoot,
  [string]$TargetReleaseRoot,
  [string]$PreviousReleaseRoot
)
$ErrorActionPreference = "Stop"

$releaseRoot = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot "releases"))
$protectedRoots = @($CurrentReleaseRoot, $TargetReleaseRoot, $PreviousReleaseRoot) |
  Where-Object { $_ } |
  ForEach-Object { [System.IO.Path]::GetFullPath($_).TrimEnd("\") } |
  Select-Object -Unique
if (-not (Test-Path -LiteralPath $releaseRoot)) { return }

foreach ($release in @(Get-ChildItem -LiteralPath $releaseRoot -Directory -Force)) {
  $releasePath = [System.IO.Path]::GetFullPath($release.FullName).TrimEnd("\")
  if ($protectedRoots -contains $releasePath) { continue }
  if (-not $releasePath.StartsWith($releaseRoot.TrimEnd("\") + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a release outside the installed releases directory: $releasePath"
  }
  Remove-Item -LiteralPath $releasePath -Recurse -Force
}
