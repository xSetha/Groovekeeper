<#
.SYNOPSIS
    Runs every check before a commit, desktop and web, and sums them up.

.DESCRIPTION
    In order: the desktop app's tests (dotnet test), the web app's typecheck and tests, the database's
    access-rule tests, and the end-to-end tests in Chrome. Checks that need the local Supabase run only
    when it's running (start it with scripts\web-dev.ps1 or npm run db:start in web\); otherwise they're
    skipped with a note, not failed. The web tests and the end-to-end tests also include the sync tests
    against the local Supabase when it runs. Exits with 1 when any check failed.

.PARAMETER SkipDesktop
    Leave out the desktop app's tests.

.PARAMETER SkipE2E
    Leave out the end-to-end tests, the slowest part.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\check.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\check.ps1 -SkipDesktop -SkipE2E
#>
param(
    [switch]$SkipDesktop,
    [switch]$SkipE2E
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_web-services.ps1"
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$web = Join-Path $root 'web'
$results = New-Object System.Collections.Generic.List[object]

function Invoke-Check([string]$Name, [string]$Folder, [scriptblock]$Command) {
    Write-Host ''
    Write-Host "== $Name" -ForegroundColor Cyan
    Push-Location $Folder
    try {
        & $Command
        $passed = $LASTEXITCODE -eq 0
    } finally {
        Pop-Location
    }
    $results.Add([pscustomobject]@{ Check = $Name; Result = $(if ($passed) { 'passed' } else { 'FAILED' }) })
}

function Skip-Check([string]$Name, [string]$Why) {
    $results.Add([pscustomobject]@{ Check = $Name; Result = "skipped: $Why" })
}

if ($SkipDesktop) {
    Skip-Check 'Desktop tests' 'left out (-SkipDesktop)'
} else {
    # Built into a folder of its own, so a copy of the app that's running doesn't lock the build.
    Invoke-Check 'Desktop tests' $root { dotnet test --nologo "-p:BaseOutputPath=$env:TEMP\SongCreatorTestBin\" }
}

Invoke-Check 'Web typecheck' $web { npm run typecheck }
Invoke-Check 'Web tests' $web { npm test }

$supabase = (Add-DockerToPath) -and (Test-DockerRunning) -and (Test-SupabaseRunning $web)
if ($supabase) {
    Invoke-Check 'Database access rules' $web { npm run test:db }
} else {
    Skip-Check 'Database access rules' 'the local Supabase is not running (scripts\web-dev.ps1 starts it)'
}

if ($SkipE2E) {
    Skip-Check 'End-to-end (Chrome)' 'left out (-SkipE2E)'
} else {
    # Without the local Supabase, the two-device sync test skips itself and the rest still runs.
    Invoke-Check 'End-to-end (Chrome)' $web { npm run test:e2e }
}

Write-Host ''
$results | Format-Table -AutoSize | Out-String | Write-Host
if (-not $supabase) {
    Write-Host 'The sync tests against Supabase were skipped too; start it to run them.' -ForegroundColor Yellow
}
if ($results | Where-Object { $_.Result -eq 'FAILED' }) {
    Write-Host 'Some checks failed; their output is above.' -ForegroundColor Red
    exit 1
}
Write-Host 'All checks passed.' -ForegroundColor Green
