<#
.SYNOPSIS
    Proves that a backup can be restored: decrypts it, loads it into a scratch database inside the local
    Supabase, and shows what came back.

.DESCRIPTION
    Follows "Restoring a backup" in web\README.md, without touching your local data: the backup goes into a
    separate database (restore_test) in the local Supabase's Postgres, which is dropped at the end. The
    steps: decrypt with the private age key, make restore_test with the same `auth` tables as the local
    database, apply the migrations, load the dump with the songs' and setlists' own triggers off, then count
    accounts, identities, songs and setlists and print a checksum of the songs' id, version and time.

    Needs Docker Desktop running and the local Supabase started (npm run db:start in web\, or
    scripts\web-dev.ps1). The private key is copied to a temporary folder for the decryption and the folder
    is deleted at the end, with the plain dump. Exits with 1 when any step failed or no account came back.

.PARAMETER Backup
    The encrypted backup (groovekeeper-YYYY-MM-DD.dump.age), or the zip downloaded from the run's Artifacts
    on GitHub (Actions -> Backup -> the run -> backup).

.PARAMETER Key
    The private age key file (the one made by age-keygen). A file in WSL can be given as
    \\wsl.localhost\<distribution>\home\<user>\groovekeeper-backup.key.

.PARAMETER Keep
    Leave the restore_test database in place, to look at it with psql or Studio. Drop it later with
    docker exec supabase_db_groovekeeper psql -U postgres -c "drop database restore_test".

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\test-restore.ps1 -Backup $HOME\Downloads\backup.zip -Key D:\keys\groovekeeper-backup.key
#>
param(
    [Parameter(Mandatory)][string]$Backup,
    [Parameter(Mandatory)][string]$Key,
    [switch]$Keep
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_web-services.ps1"

$container = 'supabase_db_groovekeeper'
$scratch = 'restore_test'
$migrations = Join-Path $PSScriptRoot '..\web\supabase\migrations'

if (-not (Add-DockerToPath) -or -not (Test-DockerRunning)) { throw 'Docker Desktop must be running.' }
if (-not (docker ps --filter "name=^$container$" --quiet)) { throw "The local Supabase isn't running (container $container). Start it with npm run db:start in web\." }
foreach ($file in $Backup, $Key) { if (-not (Test-Path $file)) { throw "Can't find $file" } }

# Runs a command in the database container; stops the script when it fails.
function Invoke-InContainer {
    & docker exec $container @args
    if ($LASTEXITCODE -ne 0) { throw "docker exec failed: $args" }
}
function Invoke-Psql([string]$Database, [string]$Sql) {
    Invoke-InContainer psql -U postgres -d $Database -v ON_ERROR_STOP=1 -At -q -c $Sql
}

$work = Join-Path ([IO.Path]::GetTempPath()) "groovekeeper-restore-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory $work | Out-Null
$failed = $false
try {
    Write-Host '1. Decrypting'
    $encrypted = $Backup
    if ($Backup -like '*.zip') {
        Expand-Archive $Backup (Join-Path $work 'zip')
        $encrypted = (Get-ChildItem (Join-Path $work 'zip') -Filter '*.dump.age' -Recurse | Select-Object -First 1).FullName
        if (-not $encrypted) { throw 'The zip has no .dump.age file.' }
    }
    Copy-Item $encrypted (Join-Path $work 'backup.age')
    Copy-Item $Key (Join-Path $work 'key')
    # Alpine's `age` does it, so nothing needs installing here.
    docker run --rm -v "${work}:/w" alpine sh -c 'apk add -q age && age -d -i /w/key -o /w/groovekeeper.dump /w/backup.age'
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $work 'groovekeeper.dump'))) { throw 'Decrypting failed: is this the private key of the public key the backup was made for?' }
    Write-Host "   OK, $((Get-Item (Join-Path $work 'groovekeeper.dump')).Length) bytes"

    Write-Host '2. Making the scratch database'
    Invoke-Psql postgres "drop database if exists $scratch"
    Invoke-Psql postgres "create database $scratch"
    # The auth tables come from the local database (the migrations only point at them).
    Invoke-InContainer sh -c "pg_dump -U supabase_admin --schema-only --no-owner --no-privileges -n auth postgres | psql -U supabase_admin -d $scratch -q -o /dev/null 2>/dev/null"
    # Without privileges in the copy, the migrations couldn't point at auth.users; `postgres` has them on a real project.
    Invoke-InContainer psql -U supabase_admin -d $scratch -v ON_ERROR_STOP=1 -q -c 'grant usage on schema auth to postgres; grant all on all tables in schema auth to postgres'
    $authTables = Invoke-Psql $scratch "select count(*) from information_schema.tables where table_schema = 'auth' and table_name in ('users', 'identities')"
    if ($authTables -ne '2') { throw "The scratch database lacks auth.users or auth.identities." }

    Write-Host '3. Applying the migrations'
    Invoke-InContainer rm -rf /tmp/restore-test
    docker cp "$migrations\." "${container}:/tmp/restore-test"
    if ($LASTEXITCODE -ne 0) { throw 'Copying the migrations failed.' }
    Invoke-InContainer sh -c "for f in /tmp/restore-test/*.sql; do psql -U postgres -d $scratch -v ON_ERROR_STOP=1 -q -f `$f || exit 1; done"
    docker cp (Join-Path $work 'groovekeeper.dump') "${container}:/tmp/restore-test/groovekeeper.dump"
    if ($LASTEXITCODE -ne 0) { throw 'Copying the dump failed.' }

    Write-Host '4. Loading the backup (the songs'' and setlists'' own triggers off, as in the README)'
    Invoke-Psql $scratch 'alter table public.songs disable trigger user; alter table public.setlists disable trigger user'
    Invoke-InContainer pg_restore -U postgres -d $scratch --data-only --no-owner --exit-on-error /tmp/restore-test/groovekeeper.dump
    Invoke-Psql $scratch 'alter table public.songs enable trigger user; alter table public.setlists enable trigger user'

    Write-Host '5. What came back'
    $report = Invoke-Psql $scratch @"
select 'accounts', count(*)::text from auth.users
union all select 'identities', count(*)::text from auth.identities
union all select 'songs', count(*)::text from public.songs
union all select 'setlists', count(*)::text from public.setlists
union all select 'songs checksum (id, version, time)',
  coalesce(md5(string_agg(id::text || ':' || version || ':' || updated_at::text, ',' order by id)), 'no songs') from public.songs
"@
    $report -replace '\|', ': ' | ForEach-Object { Write-Host "   $_" }
    if (($report -join "`n") -notmatch 'accounts\|[1-9]') { throw 'No account came back.' }
    Write-Host "`nThe backup can be restored with this key." -ForegroundColor Green
} catch {
    $failed = $true
    Write-Host "`nFAIL  $($_.Exception.Message)" -ForegroundColor Red
} finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    docker exec $container rm -rf /tmp/restore-test 2>$null
    if (-not $Keep) { docker exec $container psql -U postgres -q -c "drop database if exists $scratch" 2>$null }
}
if ($failed) { exit 1 }
