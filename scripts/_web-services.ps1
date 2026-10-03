# Helpers for the web scripts (web-dev.ps1, check.ps1): Docker Desktop and the local Supabase.
# Not run on its own; the scripts load it with: . "$PSScriptRoot\_web-services.ps1"

# Docker Desktop installs for one user or for all users; its command-line tools are in resources\bin.
function Find-DockerDesktop {
    foreach ($folder in "$env:LOCALAPPDATA\Programs\DockerDesktop", "$env:ProgramFiles\Docker\Docker") {
        if (Test-Path (Join-Path $folder 'Docker Desktop.exe')) { return $folder }
    }
    return $null
}

# Makes the docker command work in this window, even when Docker's folder isn't on the PATH.
# Returns $false when Docker Desktop isn't installed.
function Add-DockerToPath {
    if (Get-Command docker -ErrorAction SilentlyContinue) { return $true }
    $folder = Find-DockerDesktop
    if (-not $folder) { return $false }
    $env:Path = "$env:Path;$folder\resources\bin"
    return $true
}

# Whether Docker Desktop is running (its engine answers).
function Test-DockerRunning {
    docker info *> $null
    return $LASTEXITCODE -eq 0
}

# Whether the local Supabase answers, at the address and key the web app uses (apps\groovekeeper\.env).
function Test-SupabaseRunning([string]$WebFolder) {
    $settings = @{}
    foreach ($line in Get-Content (Join-Path $WebFolder 'apps\groovekeeper\.env')) {
        if ($line -match '^(\w+)=(.*)$') { $settings[$Matches[1]] = $Matches[2] }
    }
    try {
        $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 `
            -Uri "$($settings['VITE_SUPABASE_URL'])/auth/v1/health" `
            -Headers @{ apikey = $settings['VITE_SUPABASE_PUBLISHABLE_KEY'] }
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}
