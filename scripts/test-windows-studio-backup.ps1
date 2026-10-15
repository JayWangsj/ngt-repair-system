param(
  [Parameter(Mandatory = $true)]
  [string]$BackupRoot
)
$ErrorActionPreference = "Stop"

$root = [System.IO.Path]::GetFullPath($BackupRoot)
$manifestPath = Join-Path $root "SHA256SUMS.txt"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Studio backup checksum manifest is missing."
}
$rootPrefix = $root.TrimEnd("\") + "\"
$entries = @{}
foreach ($line in Get-Content -LiteralPath $manifestPath) {
  if ($line -notmatch "^([A-Fa-f0-9]{64})\s+(.+)$") {
    throw "Studio backup checksum manifest is invalid."
  }
  $relativePath = $Matches[2]
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
  if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Studio backup checksum manifest contains an invalid path."
  }
  if ($entries.ContainsKey($relativePath)) {
    throw "Studio backup checksum manifest contains duplicate paths."
  }
  $entries[$relativePath] = $Matches[1].ToLowerInvariant()
}
if (-not $entries.ContainsKey("postgres-data")) {
  if (-not ($entries.Keys | Where-Object { $_ -like "postgres-data\*" -or $_ -like "postgres-data/*" })) {
    throw "Studio backup does not contain database files."
  }
}
foreach ($relativePath in $entries.Keys) {
  $candidate = Join-Path $root $relativePath
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
    throw "Studio backup file is missing: $relativePath"
  }
  $actualHash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $entries[$relativePath]) {
    throw "Studio backup file failed integrity validation: $relativePath"
  }
}
$actualFiles = @(Get-ChildItem -LiteralPath $root -File -Recurse -Force |
  Where-Object { $_.FullName -ne $manifestPath })
if ($actualFiles.Count -ne $entries.Count) {
  throw "Studio backup file count does not match its checksum manifest."
}
Write-Output "Studio backup integrity test passed: $($entries.Count) files."
