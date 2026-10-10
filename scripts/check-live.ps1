<#
.SYNOPSIS
    Checks that the live Groovekeeper site is set up as it should be: the page, its security headers,
    the redirects, the email records, and the backup and deploy runs on GitHub.

.DESCRIPTION
    Read-only: it only fetches pages and looks up DNS records. Every line says OK or FAIL, and the script
    exits with 1 when anything failed. The GitHub lines need the `gh` command (logged in) and are skipped
    without it.

.PARAMETER Domain
    The site's address, without https://.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\check-live.ps1
#>
param(
    [string]$Domain = 'groovekeeper.app',
    [string]$Repo = 'xSetha/Groovekeeper'
)

$failed = 0
function Check([string]$Name, $Ok, [string]$Detail = '') {
    if ($Ok) { Write-Host "OK    $Name" -ForegroundColor Green }
    else { Write-Host "FAIL  $Name  $Detail" -ForegroundColor Red; $script:failed++ }
}

# Without following redirects, so a 301 shows as a 301.
function Get-Raw([string]$Url) {
    try { Invoke-WebRequest $Url -MaximumRedirection 0 -UseBasicParsing -ErrorAction Stop }
    catch { $_.Exception.Response }
}
function Header($Response, [string]$Name) {
    $value = $Response.Headers[$Name]
    if ($value -is [array]) { $value = $value -join ' ' }
    "$value"
}

Write-Host "The site"
$site = Get-Raw "https://$Domain/"
Check "https://$Domain/ answers 200" ([int]$site.StatusCode -eq 200) "got $([int]$site.StatusCode)"
Check 'Content-Security-Policy is sent' ((Header $site 'Content-Security-Policy') -match "default-src 'self'")
Check 'CSP blocks framing (frame-ancestors none)' ((Header $site 'Content-Security-Policy') -match "frame-ancestors 'none'")
Check 'CSP names a hosted Supabase, not localhost' ((Header $site 'Content-Security-Policy') -match 'https://[a-z0-9]+\.supabase\.co' -and (Header $site 'Content-Security-Policy') -notmatch '127\.0\.0\.1|localhost')
Check 'X-Content-Type-Options: nosniff' ((Header $site 'X-Content-Type-Options') -eq 'nosniff')
Check 'Referrer-Policy is sent' ((Header $site 'Referrer-Policy') -ne '')
$deep = Get-Raw "https://$Domain/songs/anything"
Check 'An app address (/songs/...) is answered with the app' ([int]$deep.StatusCode -eq 200) "got $([int]$deep.StatusCode)"
$manifest = Get-Raw "https://$Domain/manifest.webmanifest"
Check 'The app manifest is there (installable)' ([int]$manifest.StatusCode -eq 200) "got $([int]$manifest.StatusCode)"

Write-Host "`nRedirects"
$www = Get-Raw "https://www.$Domain/songs?x=1"
Check "www.$Domain redirects to $Domain, path and query kept" ([int]$www.StatusCode -eq 301 -and (Header $www 'Location') -eq "https://$Domain/songs?x=1") "got $([int]$www.StatusCode) $(Header $www 'Location')"
$http = Get-Raw "http://$Domain/"
Check 'http:// goes to https://' (([int]$http.StatusCode) -in 301, 302, 307, 308 -and (Header $http 'Location') -like 'https://*') "got $([int]$http.StatusCode)"
$pages = Get-Raw "https://$($Domain.Split('.')[0]).pages.dev/"
Check 'The pages.dev address redirects to the domain' (([int]$pages.StatusCode) -in 301, 302, 307, 308 -and (Header $pages 'Location') -like "https://$Domain*") "got $([int]$pages.StatusCode) (a Bulk Redirect is still to be made)"

Write-Host "`nEmail"
$mx = @(Resolve-DnsName $Domain -Type MX -ErrorAction SilentlyContinue | Where-Object NameExchange)
Check 'Incoming mail goes to Cloudflare (MX)' ($mx.NameExchange -match 'mx\.cloudflare\.net')
$dkim = @(Resolve-DnsName "resend._domainkey.mail.$Domain" -Type TXT -ErrorAction SilentlyContinue)
Check 'Resend DKIM record (mail subdomain)' ($dkim.Count -gt 0)
$send = @(Resolve-DnsName "send.mail.$Domain" -ErrorAction SilentlyContinue)
Check 'Resend sending record (send.mail)' ($send.Count -gt 0)
$dmarc = @(Resolve-DnsName "_dmarc.$Domain" -Type TXT -ErrorAction SilentlyContinue)
Check 'DMARC record' ($dmarc.Strings -match 'v=DMARC1')

Write-Host "`nGitHub"
if (Get-Command gh -ErrorAction SilentlyContinue) {
    foreach ($workflow in 'ci.yml', 'backup.yml') {
        $run = gh run list --repo $Repo --workflow $workflow --limit 1 --json conclusion,createdAt,headSha | ConvertFrom-Json
        $text = if ($run) { "$($run[0].conclusion), $($run[0].createdAt), $($run[0].headSha.Substring(0, 7))" } else { 'no runs' }
        Check "Latest $workflow run succeeded ($text)" ($run -and $run[0].conclusion -eq 'success')
    }
} else {
    Write-Host 'skip  GitHub runs (install and log in to gh to see them)'
}

Write-Host ''
if ($failed) { Write-Host "$failed check(s) failed." -ForegroundColor Red; exit 1 }
Write-Host 'All checks passed.' -ForegroundColor Green
