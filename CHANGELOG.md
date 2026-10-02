# Changelog

What changed in each version of Groovekeeper (called SongCreator until 1.0.0), for the people using
it. The version numbers follow the rules in [docs/RELEASING.md](docs/RELEASING.md), and each
version's section here becomes the text of its GitHub release.

## [Unreleased]

### Changed
- SongCreator is now called Groovekeeper. Your songs, setlists and settings stay where they are, and
  updates keep coming as before. The shortcuts and the entry in Windows' Installed apps get the new
  name with this update.

## [1.0.0] - 2026-10-02

The first release, with a Windows installer that keeps the app up to date.

### Added
- Chord sheet editor: lyrics with a chord lane above each line, chords dropped on the exact syllable
  and anchored to it while you edit, sections, repeat markers, and undo and redo for everything.
- Paste a whole song at once, including chords-over-lyrics text copied from chord sites, or import
  one with the built-in browser (File → Import from Web…).
- A song library with search, an import of `.txt` and ChordPro files, and a backup to a single file.
- Open and save `.txt` and ChordPro song files.
- Transpose, key detection, a chord palette for the song's key, and chords as Roman numerals.
- PDF songbooks of one or many songs, with a table of contents and repeated sections printed as
  repeats.
- Setlists, with each song in the key you'll play it in, exported to one PDF.
- Three themes: Studio (dark), Aurora (ink blue) and Paper (light).
- An installer (`SongCreator-win-Setup.exe`) and a portable zip. The app downloads new versions in
  the background and installs them the next time it starts.
