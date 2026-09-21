param([string]$Destination = "backups")
$ErrorActionPreference = 'Stop'
$directory = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Destination))
New-Item -ItemType Directory -Force -Path $directory | Out-Null
$filename = "ngt-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
$containerPath = "/tmp/$filename"
docker compose exec -T db pg_dump -U ngt -d ngt -Fc -f $containerPath
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
docker compose cp "db:$containerPath" (Join-Path $directory $filename)
if ($LASTEXITCODE -ne 0) { throw 'Copy failed; backup is still available in the database container.' }
docker compose exec -T db rm -- $containerPath
Write-Output "Backup written to $(Join-Path $directory $filename). Encrypt and copy it to a separate storage location."
