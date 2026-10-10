# Changelog

What changed in each version of Groovekeeper (called SongCreator until 1.0.0), for the people using
it. The version numbers follow the rules in [docs/RELEASING.md](docs/RELEASING.md), and each
version's section here becomes the text of its GitHub release.

## [Unreleased]

### Added
- Do Re Mi: the **Do Re Mi** button in the editor's toolbar shows every chord and the Key box as Do Re
  Mi Fa Sol La Si (`Lam7/Sol` for `Am7/G`), for all songs, and Groovekeeper remembers the choice. You
  can type chords either way (`Sol7` or `G7`, also in Find and replace); songs, files and the library
  keep letters.
- Libraries: keep songs apart in several libraries (Personal, Band…). The name at the top of the
  library panel opens a menu to switch to another library, or to create, rename or delete one. Each
  library has its own songs, notes and setlists, and a deleted library goes to the Recycle Bin. Your
  songs so far are in the first one, "My library". Songs open from the old library close when you switch.

### Changed
- In Export PDF and on the Setlists tab, the "Chords as Roman numerals" checkbox is now a Chords
  drop-down: letters, Do Re Mi or Roman numerals. It starts on how the editor shows chords.
- The menu bar now has only File. Undo, Redo and Find and replace are buttons at the start of the
  editor's toolbar, and the Songs and Setlists tabs are the only way to switch between the two.
- The library hides from its own panel: a « button in its header slides it shut, and a thin bar at the
  left edge brings it back (Ctrl+B still works).
- A section can be empty, just its heading: Backspace on a section's only empty line removes the line,
  and the caret goes to the line before. The section stays empty when the song is saved and opened
  again; + Line adds a line back.

### Fixed
- After uninstalling, installing Groovekeeper again no longer says it is already installed. The error
  log and the Import from Web browser data now live in `%LocalAppData%\Groovekeeper`, and uninstalling
  removes them.
- The start page's tips describe chords as they work since 1.2.0: typed above a letter rather than
  dragged from a panel, and transposing moves the chords but leaves the key as you set it.

## [1.2.0] - 2026-10-06

### Added
- Type chords straight onto a song: click the chord lane above a letter, type the chord and press
  Enter (Esc cancels). Only real chords are accepted; anything else shows "Not a chord". Double-click
  a chord to change it, or empty its name to remove it.
- Drag a section by the grip (⠿) next to its heading to move it anywhere in the song; a line shows
  where it will land. The ↑ ↓ buttons still work too.
- Notes: right-click the song and choose Add note here to put a note anywhere over it. Drag a note
  by its top edge, type in it (Shift+Enter for a new line, Enter when done), and right-click it to
  delete it. Notes float: they stay where you put them while you edit the lyrics, and the PDF prints
  them at the same spot. They are kept in your library with the song, not in song files.
- A faint vertical line in the editor marks the edge of the printed page, so you can see what would
  run off it.
- Short messages in the bottom-right corner confirm that a song was saved, a PDF exported, the
  library backed up, or songs imported or deleted, and tell you when an update is ready to install.

### Changed
- Most problems (a file that couldn't be opened, a library that couldn't be read) now show in the
  corner of the window instead of a pop-up box you had to close. A song that couldn't be saved still
  stops you with a message, so it isn't missed.
- An unexpected error no longer closes the app: it's reported in the corner and written to an error
  log, so you can still save your songs.
- + Section adds the new section right after the one you're working in (where the caret is),
  instead of always at the end of the song.
- Transpose moves only the chords. The song's key stays what you set it to; change it in the Key
  box when you want to. The chords are still spelled for the key they move to (Bb rather than A#
  in F).

### Removed
- The "Looks like … · Use" key suggestion next to the Key box.
- Choosing a key for each song in a setlist. Songs in a setlist are played and exported as they
  are written, and the setlist PDF no longer notes a changed key. To play a song in another key,
  transpose the song itself. Keys chosen in older setlists, and in imported `.setlist` files, are
  ignored.
- The chord panel on the right of the editor, along with dragging chords from it. Chords are typed
  instead, and the editor has more room. Chords in the song still move by dragging them sideways.

### Fixed
- Empty sections and blank lines are kept. Saving a song used to drop them, so they were gone the next
  time the song was opened, and the PDF left them out too. Now the PDF prints what the editor shows:
  an empty section as its heading, a blank line as space.

## [1.1.0] - 2026-10-02

### Changed
- SongCreator is now called Groovekeeper. Your songs, setlists and settings stay where they are, and
  updates keep coming as before. The shortcuts and the entry in Windows' Installed apps get the new
  name with this update.
- A new icon: a record whose label is a keyhole.
- The installer shows a Groovekeeper splash screen instead of a plain progress bar.
- New themes: Amp (black and blood red, the new default), Backstage (charcoal and brass), Record
  Sleeve (forest green, cream and mustard) and Songbook (cream paper with red ink chords). They
  replace Studio, Aurora and Paper; if you used one of those, you get Backstage, Amp or Songbook.
- The start page shows a photo that goes with the theme: an amp's speaker grille, a sound desk,
  record grooves or a handwritten score. Corners are squarer and the cards flat throughout the app.

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
