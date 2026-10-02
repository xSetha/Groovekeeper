<#
.SYNOPSIS
    Draws the app icon and the installer's splash image.

.DESCRIPTION
    The icon is a record whose label is a keyhole, in the Amp theme's colors (the same drawing as the
    logo on the start page, StartPage.xaml). It writes:

      SongCreator\Assets\SongCreator.ico      the app icon, 16 to 256 px; at 32 px and below the
                                              record gets one bold ring instead of three thin ones
      SongCreator\Assets\InstallerSplash.png  shown by the installer (scripts\release.ps1),
                                              over the Amp theme's photo

    Run it after changing the drawing or the colors below, and commit the results.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\make-icon.ps1
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$assets = Join-Path $root 'SongCreator\Assets'

# The Amp theme's colors (Themes\Amp.xaml)
$tile = '#141111'          # LogoTile
$record = '#050404'        # LogoRecord
$ring = '#E5534A'          # LogoRing
$label = '#C4161C'         # LogoLabel
$background = '#0F0D0D'    # WindowBackground
$text = '#ECE6E1'          # TextForeground
$muted = '#9A8F8A'         # MutedForeground
$accent = '#8E0E12'        # AccentFill

function Color($hex, $alpha = 255) { [System.Drawing.Color]::FromArgb($alpha, [System.Drawing.ColorTranslator]::FromHtml($hex)) }
function Brush($hex, $alpha = 255) { New-Object System.Drawing.SolidBrush (Color $hex $alpha) }

# Draws the icon on a 100 x 100 grid.
function Draw-Icon($g, [bool]$small) {
    $r = 22
    $tilePath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tilePath.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
    $tilePath.AddArc(100 - 2 * $r, 0, 2 * $r, 2 * $r, 270, 90)
    $tilePath.AddArc(100 - 2 * $r, 100 - 2 * $r, 2 * $r, 2 * $r, 0, 90)
    $tilePath.AddArc(0, 100 - 2 * $r, 2 * $r, 2 * $r, 90, 90)
    $tilePath.CloseFigure()
    $g.FillPath((Brush $tile), $tilePath)
    $g.FillEllipse((Brush $record), 16, 16, 68, 68)

    if ($small) {
        # One bold ring, so the record still reads as a record, and a bigger label
        $g.DrawEllipse((New-Object System.Drawing.Pen (Color $ring 210), 4), 21, 21, 58, 58)
        $g.TranslateTransform(50, 50); $g.ScaleTransform(1.2, 1.2); $g.TranslateTransform(-50, -50)
    }
    else {
        foreach ($groove in @(@(29, 128), @(24, 102), @(19, 77))) {
            $pen = New-Object System.Drawing.Pen (Color $ring $groove[1]), 1.2
            $g.DrawEllipse($pen, 50 - $groove[0], 50 - $groove[0], 2 * $groove[0], 2 * $groove[0])
        }
    }

    # The label, with a keyhole
    $g.FillEllipse((Brush $label), 37, 37, 26, 26)
    $g.FillEllipse((Brush $record), 46.4, 43.4, 7.2, 7.2)
    $keyhole = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF 48, 49), (New-Object System.Drawing.PointF 52, 49),
        (New-Object System.Drawing.PointF 53.5, 57), (New-Object System.Drawing.PointF 46.5, 57))
    $g.FillPolygon((Brush $record), $keyhole)
}

function New-Canvas($width, $height) {
    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = 'AntiAlias'
    $g.PixelOffsetMode = 'HighQuality'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    return $bitmap, $g
}

function To-Png($bitmap) {
    $stream = New-Object IO.MemoryStream
    $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    return , $stream.ToArray()
}

# ---- The icon: one PNG image per size, in an .ico file ----

$sizes = 16, 20, 24, 32, 40, 48, 64, 128, 256
$images = foreach ($size in $sizes) {
    $bitmap, $g = New-Canvas $size $size
    $g.ScaleTransform($size / 100.0, $size / 100.0)
    Draw-Icon $g ($size -le 32)
    , (To-Png $bitmap)
    $g.Dispose(); $bitmap.Dispose()
}

$ico = New-Object IO.MemoryStream
$writer = New-Object IO.BinaryWriter $ico
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $writer.Write([byte]($sizes[$i] % 256)); $writer.Write([byte]($sizes[$i] % 256))   # 256 is written as 0
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
    $offset += $images[$i].Length
}
foreach ($image in $images) { $writer.Write($image) }
$writer.Flush()
[IO.File]::WriteAllBytes((Join-Path $assets 'SongCreator.ico'), $ico.ToArray())

# ---- The installer's splash: the Amp photo, dimmed, with the icon and the name ----

$width, $height = 640, 360
$bitmap, $g = New-Canvas $width $height
$photo = [System.Drawing.Image]::FromFile((Join-Path $assets 'Backgrounds\amp.jpg'))
$g.DrawImage($photo, (New-Object System.Drawing.Rectangle(0, 0, $width, $height)),
    (New-Object System.Drawing.Rectangle(0, 0, $photo.Width, [int]($photo.Width * $height / $width))),
    [System.Drawing.GraphicsUnit]::Pixel)
$photo.Dispose()
$g.FillRectangle((Brush $background 222), 0, 0, $width, $height)

$state = $g.Save()
$g.TranslateTransform(64, 108); $g.ScaleTransform(1.12, 1.12)
Draw-Icon $g $false
$g.Restore($state)

$pixels = [System.Drawing.GraphicsUnit]::Pixel
$g.DrawString('Groovekeeper', (New-Object System.Drawing.Font 'Segoe UI', 34, ([System.Drawing.FontStyle]::Bold), $pixels), (Brush $text), 196, 118)
$g.DrawString('Chord sheets, setlists and songbooks', (New-Object System.Drawing.Font 'Segoe UI', 17, ([System.Drawing.FontStyle]::Regular), $pixels), (Brush $muted), 199, 170)
$g.FillRectangle((Brush $accent), 0, $height - 4, $width, 4)
[IO.File]::WriteAllBytes((Join-Path $assets 'InstallerSplash.png'), (To-Png $bitmap))
$g.Dispose(); $bitmap.Dispose()

Write-Host "Wrote SongCreator.ico ($($sizes -join ', ') px) and InstallerSplash.png in $assets"
