param([Parameter(Mandatory = $true)][string]$BackupFile)
$ErrorActionPreference = 'Stop'
$backup = (Resolve-Path -LiteralPath $BackupFile).Path
$database = "ngt_restore_test_$(Get-Date -Format 'yyyyMMddHHmmss')"
$containerPath = "/tmp/$database.dump"
docker compose cp $backup "db:$containerPath"
if ($LASTEXITCODE -ne 0) { throw 'Backup copy failed' }
docker compose exec -T db createdb -U ngt $database
if ($LASTEXITCODE -ne 0) { throw 'Test database creation failed' }
docker compose exec -T db pg_restore -U ngt --exit-on-error -d $database $containerPath
if ($LASTEXITCODE -ne 0) { throw 'Restore failed; test database retained for diagnosis.' }
docker compose exec -T db psql -U ngt -d $database -c 'SELECT COUNT(*) AS work_orders FROM "WorkOrder"; SELECT COUNT(*) AS payments FROM "Payment";'
if ($LASTEXITCODE -ne 0) { throw 'Restore verification failed' }
Write-Output "Restore verified in isolated database $database. Production database was not overwritten."
