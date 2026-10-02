# SongCreator

A Windows desktop app for writing chord sheets: type the lyrics, drop each chord exactly on the
syllable where it changes, then transpose, print, and build setlists for a gig.

Songs live in the app's library, with search, and you can still open and save song files:
plain `.txt` with the chords on the line above the lyrics, or the ChordPro format used by many
other chord apps.

## Features

**Writing**
- Lyrics with a chord lane above each line. Chords stay anchored to their letter while you edit.
- Drag chords from the palette onto a word, drag them sideways to move them, right-click to remove.
- Sections (`[Verse 1]`, `[Chorus]`, …) that you can rename, move up and down, duplicate or delete.
- Repeat markers: "play the chorus again" without copying it. Shown as `[Chorus] (repeat)`.
- Paste a whole song at once, including chords-over-lyrics text copied from chord sites.
- Undo and redo for everything: typing, chords, sections and transposing.
- Find and replace in the lyrics (matches are highlighted) or in the chords, by exact name.
- Several songs open at once, each in its own tab. An icon on the tab and a label next to the
  Save button show where the song is saved: in the library, in a file, or not yet.

**Library**
- Every song you save goes into the library. It's listed on the start page and in a side panel
  next to the editor (Ctrl+B), sorted by title, with a search over title, artist and key.
  The app remembers whether the panel was open, and the window's size.
- Double-click a song to open it, right-click to delete it (it is also taken out of its setlists).
- Import `.txt` and ChordPro files into the library; the files themselves aren't changed.
- Back up the whole library to a single file (File → Back Up Library…).

**Import from the web**
- File → Import from Web… (Ctrl+I) opens a built-in browser. Search for a song, open its chord
  page, select the chords and lyrics (or nothing, to take the page's chord sheet), and press
  Import. The song opens as a new tab with its sections and chords; title and artist are
  guessed from the page title.
- The app never searches or downloads songs on its own. Songs on chord sites are usually
  copyrighted: import them for your own use, and check the site's terms before sharing.
- Needs the Microsoft Edge WebView2 Runtime, which comes with Windows 11 and most Windows 10 PCs.

**Song files**
- Open `.txt` and ChordPro files (`.cho`, `.chopro`, `.chordpro`, `.pro`) and edit them in place:
  Save writes the file, in its own format.
- Save As File writes a `.txt` or ChordPro file. For a library song it's a copy, and the song
  stays in the library.

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
- Setlists, on their own tab (Ctrl+L, or Songs / Setlists at the top of the window): as many
  as you like, each with library songs in playing order and the key you'll play each one in.
  The same song can be in several setlists, in a different key in each.
- Drag songs to reorder a setlist, and drag them in from the library next to it (or press +).
  Every change is saved in the library right away.
- Double-click a song in a setlist to edit it in the song editor. A setlist only refers to its
  songs, so the edit shows in every setlist that has it; choosing a key in a setlist never
  changes the song.
- Export a setlist to one PDF. Each transposed song is marked in the PDF, e.g.
  `[Key of E (+4 semitones from the original)]`. Older `.setlist` files can be imported,
  together with their songs.

**Looks**
- Three themes: Studio (dark), Aurora (ink blue) and Paper (light).

## Getting started

Requires Windows and the [.NET 10 SDK](https://dotnet.microsoft.com/download).

```powershell
dotnet run --project SongCreator     # start the app
dotnet test                          # run the tests
```

To try the app with some public-domain songs, import the files in `samples/songs` into the
library (File → Import Songs into Library…). The seed script copies them to a songs folder
first (by default `Documents\SongCreator\Songs`), if you'd rather import them from there:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\seed-songs.ps1
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+N | New song |
| Ctrl+O | Open songs |
| Ctrl+S | Save (to the library, or to the song's file if it was opened from one) |
| Ctrl+Shift+S | Save as file |
| Ctrl+B | Show or hide the library panel |
| Ctrl+I | Import from the web |
| Ctrl+E | Export PDF |
| Ctrl+L | Setlists tab |
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

**Songs in ChordPro (`.cho`, `.chopro`, `.chordpro`, `.pro`)**: directives in braces and each
chord in brackets right before the letter it belongs to. Sections are saved as verse, chorus or
bridge environments, depending on their name. A chorus repeat is `{chorus}`; any other repeat is a
`{comment:}` heading naming an earlier section, with nothing under it. When reading, `{comment:}`
headings and paragraphs separated by blank lines also become sections. Directives the app has no
place for (capo, tempo, …) are skipped, so they are not kept when the song is saved.

```text
{title: Amazing Grace}
{artist: John Newton}
{key: G}

{start_of_verse: Verse 1}
A[G]mazing grace, how [G7]sweet the [C]sound
That [G]saved a wretch like [D]me
{end_of_verse}

{comment: Verse 1}
```

**Library (`%AppData%\SongCreator\library.db`)**: a SQLite database with the songs and the
setlists. Each song is stored as its `.txt` text. Don't keep it in a folder that a cloud service
syncs while the app is open; use File → Back Up Library… to make a copy instead.

**Older setlists (`.setlist`)**: setlists used to be JSON files that point to song files. They can
be imported on the Setlists tab (Import…), which adds their songs to the library.

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
| `SongCreator/IO` | Song library (SQLite), song files, setlist import, PDF export (QuestPDF) |
| `SongCreator/ViewModels` | Editor, library, palette, undo history, find/replace, export and setlist logic |
| `SongCreator/Views`, `Controls` | WPF windows and the lyric line editor |
| `SongCreator/Themes` | The three themes |
| `SongCreator.Tests` | xUnit tests |
