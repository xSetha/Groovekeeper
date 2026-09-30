<#
.SYNOPSIS
    Seeds SongCreator's sample songs (samples/songs/*.txt) into a songs folder.

.DESCRIPTION
    SongCreator keeps songs as .txt files. This copies the public-domain sample songs
    into a folder so you can open them (File > Open Song...) or export them together
    (File > Export PDF...). Existing files are left alone unless -Force is given.

.PARAMETER Destination
    Folder to seed. Defaults to Documents\SongCreator\Songs.

.PARAMETER Force
    Overwrite songs that already exist in the destination.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\seed-songs.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\seed-songs.ps1 -Destination D:\Songs -Force
#>
param(
    [string]$Destination = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'SongCreator\Songs'),
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '..\samples\songs'
New-Item -ItemType Directory -Force -Path $Destination | Out-Null

$added = 0
$skipped = 0
foreach ($file in Get-ChildItem -Path $source -Filter '*.txt') {
    $target = Join-Path $Destination $file.Name
    if ((Test-Path $target) -and -not $Force) {
        Write-Host "  skipped  $($file.Name) (already there; use -Force to overwrite)"
        $skipped++
        continue
    }
    Copy-Item -Path $file.FullName -Destination $target -Force
    Write-Host "  added    $($file.Name)"
    $added++
}

Write-Host ""
Write-Host "Seeded $added song(s) into $Destination ($skipped skipped)."
Write-Host "Open them in SongCreator with File > Open Song... (Ctrl+O)."
