<#
.SYNOPSIS
    Builds the SongCreator installer and update packages for the version in SongCreator.csproj.

.DESCRIPTION
    Publishes the app self-contained for 64-bit Windows (no .NET install needed) and packs it with
    Velopack into artifacts\releases:

      SongCreator-win-Setup.exe     the installer to hand out
      SongCreator-win-Portable.zip  the app without installing
      *.nupkg, releases.win.json    the update packages the installed apps download

    The latest GitHub release is downloaded first, so Velopack can also build a small delta update
    from it. The GitHub workflow (.github/workflows/release.yml) runs this script and uploads the
    result; run it yourself to try the installer before tagging. See docs\RELEASING.md.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\release.ps1
#>

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$project = Join-Path $root 'SongCreator\SongCreator.csproj'
$publishDir = Join-Path $root 'artifacts\publish'
$releasesDir = Join-Path $root 'artifacts\releases'
$repoUrl = 'https://github.com/xSetha/SongCreator'

function Invoke-Checked {
    & $args[0] $args[1..($args.Count - 1)]
    if ($LASTEXITCODE -ne 0) { throw "$($args[0]) $($args[1]) failed (exit code $LASTEXITCODE)." }
}

$version = ([xml](Get-Content $project -Raw)).Project.PropertyGroup.Version | Where-Object { $_ } | Select-Object -First 1
if (-not $version) { throw "No <Version> in $project." }
Write-Host "Building SongCreator $version"

# A fresh publish folder, so files from older builds don't end up in the package
if (Test-Path $publishDir) { Remove-Item $publishDir -Recurse -Force }

Invoke-Checked dotnet tool restore
Invoke-Checked dotnet publish $project -c Release -r win-x64 --self-contained -o $publishDir

dotnet vpk download github --repoUrl $repoUrl -o $releasesDir
if ($LASTEXITCODE -ne 0) { Write-Warning 'No earlier release downloaded; this release gets no delta update.' }

Invoke-Checked dotnet vpk pack `
    --packId SongCreator `
    --packVersion $version `
    --runtime win-x64 `
    --packDir $publishDir `
    --mainExe SongCreator.exe `
    --packTitle SongCreator `
    --packAuthors xSetha `
    --icon (Join-Path $root 'SongCreator\Assets\SongCreator.ico') `
    --outputDir $releasesDir

Write-Host ""
Write-Host "Done: $releasesDir"
