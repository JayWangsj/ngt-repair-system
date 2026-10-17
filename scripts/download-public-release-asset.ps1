param(
  [Parameter(Mandatory = $true)]
  [uri]$AssetUrl,
  [Parameter(Mandatory = $true)]
  [string]$Destination
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
if ($AssetUrl.Scheme -ne "https" -or
    $AssetUrl.Host -ne "github.com" -or
    -not $AssetUrl.AbsolutePath.StartsWith("/JayWangsj/ngt1/releases/download/", [System.StringComparison]::Ordinal)) {
  throw "The public Release asset URL is not from the expected repository."
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$temporaryPath = "$Destination.$PID.download"
try {
  Invoke-WebRequest -Uri $AssetUrl.AbsoluteUri -OutFile $temporaryPath `
    -UseBasicParsing -TimeoutSec 1800 -Headers @{ "User-Agent" = "NGT-Studio-Updater" }
  Move-Item -LiteralPath $temporaryPath -Destination $Destination -Force
} catch {
  Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
  throw
}
