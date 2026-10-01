# SongCreator

A Windows desktop app for writing chord sheets: type the lyrics, drop each chord exactly on the
syllable where it changes, then transpose, print, and build setlists for a gig.

Songs are plain `.txt` files with the chords on the line above the lyrics, so they stay readable
in any text editor.

## Features

**Writing**
- Lyrics with a chord lane above each line. Chords stay anchored to their letter while you edit.
- Drag chords from the palette onto a word, drag them sideways to move them, right-click to remove.
- Sections (`[Verse 1]`, `[Chorus]`, …) that you can rename, move up and down, duplicate or delete.
- Repeat markers: "play the chorus again" without copying it. Shown as `[Chorus] (repeat)`.
- Paste a whole song at once, including chords-over-lyrics text copied from chord sites.
- Undo and redo for everything: typing, chords, sections and transposing.
- Find and replace in the lyrics (matches are highlighted) or in the chords, by exact name.
- Several songs open at once, each in its own tab.

**Music**
- Transpose up or down by semitones. The key and every chord are respelled to match.
- Key detection: when the chords point to a key the song isn't set to, the editor suggests it.
- A chord palette with the chords of the song's key, the chords that usually come next,
  the chords already in the song, and every chord type (including slash chords) by root.
- Roman numerals (`I IV V vi`, `ii7`, `bVII`, `I/3`), shown on the palette chips and,
  with the **I IV V** toggle, on the chords in the editor.

**Printing and gigs**
- Export one or many songs to a single PDF songbook, with an optional table of contents
  and an option to print the chords as Roman numerals.
- Setlists: songs in playing order, each in the key you'll play it in, saved as a
  `.setlist` file and exported to one PDF. The song files are never changed. Each transposed
  song is marked in the PDF, e.g. `[Key of E (+4 semitones from the original)]`.

**Looks**
- Three themes: Studio (dark), Aurora (ink blue) and Paper (light).

## Getting started

Requires Windows and the [.NET 10 SDK](https://dotnet.microsoft.com/download).

```powershell
dotnet run --project SongCreator     # start the app
dotnet test                          # run the tests
```

To try the app with some public-domain songs, copy the samples from `samples/songs` into a
songs folder (by default `Documents\SongCreator\Songs`):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\seed-songs.ps1
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+N | New song |
| Ctrl+O | Open songs |
| Ctrl+S | Save (asks where only for a new song) |
| Ctrl+Shift+S | Save as |
| Ctrl+E | Export PDF |
| Ctrl+L | Setlist |
| Ctrl+Z | Undo |
| Ctrl+Y, Ctrl+Shift+Z | Redo |
| Ctrl+F, Ctrl+H | Find and replace (Enter: next match, Esc: close) |
| Enter | Split the line at the cursor |
| Backspace (at line start) | Join with the line above |
| Up / Down | Move between lines |

Closing a song (or the app) with unsaved changes asks whether to save it first.

## File formats

**Songs (`.txt`)**: title, artist, key, then sections. Chords sit above the letter they
belong to, and a `(Repeat)` line under a heading marks a repeat of that section.

```text
Amazing Grace
John Newton

Key: G

[Verse 1]
 G                 G7        C
Amazing grace, how sweet the sound
     G                   D
That saved a wretch like me

[Verse 1]
(Repeat)
```

**Setlists (`.setlist`)**: JSON with the setlist's name and its songs in order, each with
the key to play it in. Song paths are relative to the setlist file, so a folder of songs and
its setlists can be moved together.

```json
{
  "name": "Friday gig",
  "songs": [
    { "path": "Amazing Grace.txt", "key": "A" },
    { "path": "House of the Rising Sun.txt", "key": "Em" }
  ]
}
```

## Project layout

| Folder | Contents |
| --- | --- |
| `SongCreator/Models` | Song, sections, lines and chord placements |
| `SongCreator/Music` | Chord parsing, keys, transposing, key detection, Roman numerals |
| `SongCreator/IO` | Song text files, setlist files, PDF export (QuestPDF) |
| `SongCreator/ViewModels` | Editor, palette, undo history, find/replace, export and setlist logic |
| `SongCreator/Views`, `Controls` | WPF windows and the lyric line editor |
| `SongCreator/Themes` | The three themes |
| `SongCreator.Tests` | xUnit tests |
