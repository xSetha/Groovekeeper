<#
.SYNOPSIS
    Starts everything the web app needs while working on it: Docker Desktop, the local Supabase, and
    the app itself at http://localhost:5173.

.DESCRIPTION
    Starts Docker Desktop if it isn't running (and waits for it), adds Docker to this window's PATH if
    it's missing there, starts the local Supabase (npm run db:start in web\; it keeps running until
    npm run db:stop), then runs the app's dev server. Ctrl+C stops the dev server; the local Supabase
    keeps running for next time.

.PARAMETER Network
    Also serve the app on the local network (for trying it on a phone), as npm run dev -- --host.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\web-dev.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\web-dev.ps1 -Network
#>
param(
    [switch]$Network
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_web-services.ps1"
$web = (Resolve-Path (Join-Path $PSScriptRoot '..\web')).Path

if (-not (Add-DockerToPath)) {
    throw "Docker Desktop isn't installed. Get it from https://www.docker.com/products/docker-desktop/ and run this again."
}
if (-not (Test-DockerRunning)) {
    Write-Host 'Starting Docker Desktop...'
    Start-Process (Join-Path (Find-DockerDesktop) 'Docker Desktop.exe')
    $deadline = (Get-Date).AddMinutes(3)
    while (-not (Test-DockerRunning)) {
        if ((Get-Date) -gt $deadline) { throw "Docker Desktop didn't start within 3 minutes. Open it, wait until it runs, and try again." }
        Start-Sleep -Seconds 3
    }
}

Push-Location $web
try {
    if (Test-SupabaseRunning $web) {
        Write-Host 'The local Supabase is already running.'
    } else {
        Write-Host 'Starting the local Supabase (the first time downloads its images, a few GB)...'
        npm run db:start
        if ($LASTEXITCODE -ne 0) { throw "The local Supabase didn't start; the reason is above." }
    }
    Write-Host ''
    Write-Host 'Studio (tables, users): http://127.0.0.1:54323    Emails sent: http://127.0.0.1:54324'
    Write-Host 'Stop the app with Ctrl+C; stop the local Supabase with: npm run db:stop (in web\)'
    Write-Host ''
    if ($Network) { npm run dev -- --host } else { npm run dev }
} finally {
    Pop-Location
}
