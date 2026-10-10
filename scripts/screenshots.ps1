<#
.SYNOPSIS
    Takes the README's screenshots: the start page and the song editor in every theme.

.DESCRIPTION
    Builds the app, then for each theme starts it, captures its window and closes it again. It writes
    docs\screenshots\start-<theme>.jpg and editor-<theme>.png.

    The screenshots must only show the public-domain songs in samples\songs, never your own library.
    So the script backs up your library and settings (%AppData%\SongCreator), runs the app on an empty
    library that it fills with the sample songs (File > Import Songs into Library), and afterwards puts
    your files back and checks they're unchanged. If anything goes wrong it says where the backup is.

    It works through UI Automation and window messages only: no mouse moves or keystrokes, so it
    doesn't touch other windows. Close Groovekeeper before running it. A Groovekeeper window opens
    and closes once per theme.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\screenshots.ps1
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class Win {
    public delegate bool EnumProc(IntPtr hwnd, IntPtr lParam);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc proc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder name, int max);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr w, string l);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);

    // The visible top-level windows of a process (UI Automation's root list misses owned dialogs).
    public static List<IntPtr> Windows(uint pid) {
        var result = new List<IntPtr>();
        EnumWindows((h, l) => {
            uint p; GetWindowThreadProcessId(h, out p);
            if (p == pid && IsWindowVisible(h)) result.Add(h);
            return true;
        }, IntPtr.Zero);
        return result;
    }

    // The file name box of a common file dialog: an Edit inside control 1148 (or 1001 in some layouts).
    public static IntPtr FileNameBox(IntPtr dialog) {
        foreach (int id in new[] { 1148, 1001 }) {
            IntPtr found = IntPtr.Zero;
            EnumChildWindows(dialog, (h, l) => {
                var name = new StringBuilder(64); GetClassName(h, name, 64);
                if (found == IntPtr.Zero && name.ToString() == "Edit" && IsWindowVisible(h)) {
                    IntPtr p = h;
                    for (int i = 0; i < 3 && p != IntPtr.Zero; i++) { if (GetDlgCtrlID(p) == id) { found = h; break; } p = GetParent(p); }
                }
                return true;
            }, IntPtr.Zero);
            if (found != IntPtr.Zero) return found;
        }
        return IntPtr.Zero;
    }
}
"@

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$outDir = Join-Path $root 'docs\screenshots'
$buildDir = Join-Path $root 'artifacts\screenshots-app'
$samples = Join-Path $root 'samples\songs'
$dataDir = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'SongCreator'
# libraries.json too: it names the open library, which could be another file than library.db
$dataFiles = 'library.db', 'library.db-wal', 'library.db-shm', 'libraries.json', 'theme.txt', 'window.json'
# Theme name (as the app saves it) -> file name part
$themes = [ordered]@{ 'Amp' = 'amp'; 'Backstage' = 'backstage'; 'Record Sleeve' = 'recordsleeve'; 'Songbook' = 'songbook' }

$A = [System.Windows.Automation.AutomationElement]
$Scope = [System.Windows.Automation.TreeScope]

function Wait-Until($what, [scriptblock]$test) {
    for ($i = 0; $i -lt 80; $i++) {
        $result = & $test
        if ($result) { return $result }
        Start-Sleep -Milliseconds 250
    }
    throw "Timed out waiting for $what."
}

# A visible window of the app, by title.
function Get-AppWindow($app, $title) {
    Wait-Until "the window '$title'" {
        foreach ($h in [Win]::Windows([uint32]$app.Id)) {
            $element = $A::FromHandle($h)
            if ($element.Current.Name -eq $title) { return $element }
        }
    }
}

function Invoke-Element($element) {
    $pattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) { $pattern.Invoke(); return }
    if ($element.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$pattern)) { $pattern.Expand(); return }
    throw "Can't invoke '$($element.Current.Name)'."
}

# Runs a menu command: opens the top menu by name and invokes the item whose name matches the pattern.
function Invoke-Menu($app, $menu, $itemPattern) {
    $window = Get-AppWindow $app 'Groovekeeper'
    $condition = New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, $menu)
    Invoke-Element ($window.FindFirst($Scope::Descendants, $condition))
    $menuItem = [System.Windows.Automation.ControlType]::MenuItem
    $item = Wait-Until "the menu item '$itemPattern'" {
        foreach ($h in [Win]::Windows([uint32]$app.Id)) {
            $items = $A::FromHandle($h).FindAll($Scope::Descendants,
                (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, $menuItem)))
            foreach ($candidate in $items) { if ($candidate.Current.Name -like $itemPattern) { return $candidate } }
        }
    }
    Invoke-Element $item
}

# Fills the app's "Open song" dialog with a file name (or folder) and presses OK, through window messages.
function Submit-FileDialog($app, $fileName) {
    $dialog = [IntPtr]((Get-AppWindow $app 'Open song').Current.NativeWindowHandle)
    $box = Wait-Until 'the file name box' { $b = [Win]::FileNameBox($dialog); if ($b -ne [IntPtr]::Zero) { $b } }
    [Win]::SendMessage($box, 0x000C, [IntPtr]::Zero, $fileName) | Out-Null   # WM_SETTEXT
    Start-Sleep -Milliseconds 300
    [Win]::PostMessage($dialog, 0x0111, [IntPtr]1, [IntPtr]::Zero) | Out-Null # WM_COMMAND IDOK
    Start-Sleep -Milliseconds 800
}

function Wait-DialogClosed($app) {
    Wait-Until 'the file dialog to close' {
        -not ([Win]::Windows([uint32]$app.Id) | Where-Object { $A::FromHandle($_).Current.Name -eq 'Open song' })
    } | Out-Null
}

# Scrolls the main window's scrollable areas back to the top.
function Reset-Scrolling($app) {
    $window = Get-AppWindow $app 'Groovekeeper'
    $condition = New-Object System.Windows.Automation.PropertyCondition($A::IsScrollPatternAvailableProperty, $true)
    foreach ($element in $window.FindAll($Scope::Descendants, $condition)) {
        $scroll = $element.GetCurrentPattern([System.Windows.Automation.ScrollPattern]::Pattern)
        if ($scroll.Current.VerticallyScrollable) { $scroll.SetScrollPercent([System.Windows.Automation.ScrollPattern]::NoScroll, 0) }
    }
}

# Captures the app's main window (rendered by the window itself, even if other windows cover it).
function Save-Screenshot($app, $path) {
    Start-Sleep -Milliseconds 800
    $hwnd = [IntPtr]((Get-AppWindow $app 'Groovekeeper').Current.NativeWindowHandle)
    $rect = New-Object Win+RECT
    [Win]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
    $bitmap = New-Object System.Drawing.Bitmap ($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $hdc = $g.GetHdc(); [Win]::PrintWindow($hwnd, $hdc, 2) | Out-Null; $g.ReleaseHdc($hdc)
    if ($path.EndsWith('.jpg')) {
        # The start pages have a photo behind them: JPEG keeps them small
        $jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
        $quality = New-Object System.Drawing.Imaging.EncoderParameters 1
        $quality.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]88)
        $bitmap.Save($path, $jpeg, $quality)
    }
    else {
        $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    $g.Dispose(); $bitmap.Dispose()
    Write-Host "  $([IO.Path]::GetFileName($path))"
}

if (Get-Process SongCreator -ErrorAction SilentlyContinue) {
    throw 'Groovekeeper is running. Close it first: the script runs it on a sample library in place of yours.'
}

Write-Host 'Building the app'
dotnet build (Join-Path $root 'SongCreator\SongCreator.csproj') -c Release -o $buildDir -v quiet -nologo
if ($LASTEXITCODE -ne 0) { throw 'The build failed.' }
$exe = Join-Path $buildDir 'SongCreator.exe'

# Back up the user's library and settings, with a hash of each file to check the restore
$backupDir = Join-Path $env:TEMP "Groovekeeper-screenshots-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backedUp = @{}
foreach ($name in $dataFiles) {
    $file = Join-Path $dataDir $name
    if (Test-Path $file) {
        Copy-Item $file $backupDir
        $backedUp[$name] = (Get-FileHash $file).Hash
    }
}
Write-Host "Backed up your library and settings to $backupDir"

$app = $null
try {
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    foreach ($name in $dataFiles) { Remove-Item (Join-Path $dataDir $name) -ErrorAction SilentlyContinue }
    Set-Content (Join-Path $dataDir 'window.json') '{"Width":1280,"Height":800,"IsLibraryPanelOpen":true}' -NoNewline
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null

    $sampleNames = (Get-ChildItem $samples -Filter '*.txt' | ForEach-Object { '"' + $_.Name + '"' }) -join ' '
    $imported = $false
    foreach ($theme in $themes.Keys) {
        Write-Host "$theme"
        Set-Content (Join-Path $dataDir 'theme.txt') $theme -NoNewline
        $app = Start-Process $exe -PassThru
        Get-AppWindow $app 'Groovekeeper' | Out-Null

        if (-not $imported) {
            # Fill the empty library with the sample songs: go to their folder, then pick them all
            Invoke-Menu $app 'File' 'Import Songs into Library*'
            Submit-FileDialog $app $samples
            Submit-FileDialog $app $sampleNames
            Wait-DialogClosed $app
            # The "Imported 6 songs" toast closes on its own after 4 seconds: not in the screenshot
            Start-Sleep -Seconds 5
            $imported = $true
        }

        Reset-Scrolling $app
        Save-Screenshot $app (Join-Path $outDir "start-$($themes[$theme]).jpg")

        Invoke-Menu $app 'File' 'Open Song*'
        Submit-FileDialog $app (Join-Path $samples 'Amazing Grace.txt')
        Wait-DialogClosed $app
        Save-Screenshot $app (Join-Path $outDir "editor-$($themes[$theme]).png")

        Stop-Process -Id $app.Id -Force
        $app.WaitForExit()
        $app = $null
    }
}
finally {
    if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force; $app.WaitForExit() }

    # Put the user's files back exactly as they were
    foreach ($name in $dataFiles) { Remove-Item (Join-Path $dataDir $name) -ErrorAction SilentlyContinue }
    $problems = @()
    foreach ($name in $backedUp.Keys) {
        Copy-Item (Join-Path $backupDir $name) $dataDir
        if ((Get-FileHash (Join-Path $dataDir $name)).Hash -ne $backedUp[$name]) { $problems += $name }
    }
    if ($problems) {
        Write-Warning "These files didn't restore correctly: $($problems -join ', '). Your originals are in $backupDir"
    }
    else {
        Remove-Item $backupDir -Recurse -Force
        Write-Host 'Restored your library and settings.'
    }
}

Write-Host "Screenshots are in $outDir"
