# Shared test fixtures

Test cases that every Groovekeeper implementation must pass: the desktop app (C#, run by
`SongCreator.Tests/SharedFixturesTests.cs`) and the web app's core package. They pin down the song
file formats and the music rules, so a song saved by one app reads the same in the other.

When a rule changes, change the fixture first; then both test suites show what to fix.

## `songs/`

Each case is a song as JSON plus one or more song files with the same base name:

| File | Check |
| --- | --- |
| `name.json` | The song: title, artist, key, sections with their lines and chords |
| `name.txt`, `name.cho` | Read both ways: reading the file gives `name.json`, writing `name.json` gives the file |
| `name.in.txt`, `name.in.cho` | Read only: reading the file gives `name.json` (input in a form the app doesn't write) |
| `name.out.txt`, `name.out.cho` | Write only: writing `name.json` gives the file |

`.txt` is the app's text format, `.cho` is ChordPro. Files use `\n` line endings; compare after
turning `\r\n` into `\n`. A chord's `position` is the index of the letter it sits above, and may
be past the end of the text (chord-only lines).

## `music/`

| File | What it covers |
| --- | --- |
| `chords.json` | Valid chords split into root, type, bass and triad; text that isn't a chord; pitch classes of rare spellings |
| `transpose.json` | Transposing chords (`useFlats`: `true`, `false` or `null` to keep each note's own accidental), keys, which keys use flats, and whole songs (`steps` applied in order) |
| `roman-numerals.json` | A chord written as a Roman numeral in a key; `null` when the chord or key isn't valid |
| `key-detection.json` | The key guessed from a song's chords; `null` when there's no clear key |
| `chord-theory.json` | The chords of a key, the palette root of a key, whether a chord fits a key, and what usually comes next |
