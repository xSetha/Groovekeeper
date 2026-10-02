<#
.SYNOPSIS
    Prepares a release: sets the version, dates the changelog and commits both.

.DESCRIPTION
    Follows the steps in docs\RELEASING.md:
      - checks that the version is the next MAJOR, MINOR or PATCH version and that the changelog's
        [Unreleased] section allows it (Added, Changed or Removed entries need at least a MINOR release),
      - sets <Version> in SongCreator\SongCreator.csproj,
      - renames "## [Unreleased]" in CHANGELOG.md to the version and today's date, with a new empty
        "## [Unreleased]" above it,
      - commits the two files as "chore: release <version>".
    It doesn't tag or push; it prints the commands for that.

.PARAMETER Version
    The version to release, e.g. 1.1.0.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\prepare-release.ps1 -Version 1.1.0
#>
param(
    [Parameter(Mandatory = $true)][string]$Version
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$project = Join-Path $root 'SongCreator\SongCreator.csproj'
$changelog = Join-Path $root 'CHANGELOG.md'

# Reads and writes a text file as UTF-8, keeping its byte order mark (or lack of one).
function Read-Text($path) { [IO.File]::ReadAllText($path) }
function Write-Text($path, $text) {
    $bytes = [IO.File]::ReadAllBytes($path)
    $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
    [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $hasBom))
}

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "'$Version' isn't a version like 1.2.3." }

Push-Location $root
try {
    if (git status --porcelain) { throw 'There are uncommitted changes. Commit or stash them first.' }

    $projectText = Read-Text $project
    if ($projectText -notmatch '<Version>(\d+)\.(\d+)\.(\d+)</Version>') { throw "No <Version> in $project." }
    $major, $minor, $patch = [int]$Matches[1], [int]$Matches[2], [int]$Matches[3]
    $current = "$major.$minor.$patch"
    $next = @{
        "$($major + 1).0.0" = 'MAJOR'
        "$major.$($minor + 1).0" = 'MINOR'
        "$major.$minor.$($patch + 1)" = 'PATCH'
    }
    if (-not $next.ContainsKey($Version)) {
        throw "$Version doesn't follow $current. The next version is one of: $(($next.Keys | Sort-Object) -join ', ')."
    }
    $kind = $next[$Version]

    $changelogText = Read-Text $changelog
    $section = [regex]::Match($changelogText, '(?ms)^## \[Unreleased\][^\n]*\n(.*?)(?=^## \[|\z)')
    if (-not $section.Success) { throw "CHANGELOG.md has no '## [Unreleased]' section." }
    $entries = $section.Groups[1].Value.Trim()
    if (-not $entries) { throw "The [Unreleased] section of CHANGELOG.md is empty: there's nothing to release." }
    if ($kind -eq 'PATCH' -and $entries -match '(?m)^### (Added|Changed|Removed)') {
        throw "[Unreleased] has $($Matches[1]) entries, so this needs at least a MINOR release ($major.$($minor + 1).0)."
    }

    $date = Get-Date -Format 'yyyy-MM-dd'
    Write-Text $project ($projectText -replace '<Version>\d+\.\d+\.\d+</Version>', "<Version>$Version</Version>")
    $nl = if ($changelogText.Contains("`r`n")) { "`r`n" } else { "`n" }
    Write-Text $changelog ([regex]::new('(?m)^## \[Unreleased\]').Replace($changelogText, "## [Unreleased]$nl$nl## [$Version] - $date", 1))

    git add -- $project $changelog
    if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }
    git commit -q -m "chore: release $Version"
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }

    Write-Host "Committed $kind release $Version ($current -> $Version, dated $date)."
    Write-Host ''
    Write-Host 'To publish it, tag the commit and push both:'
    Write-Host "  git tag v$Version"
    Write-Host "  git push origin main v$Version"
}
finally {
    Pop-Location
}
