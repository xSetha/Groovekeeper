using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Input;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.ViewModels
{
    public record FocusRequest(SongLine Line, int Caret);

    /// <summary>
    /// One open song (a tab): where it is saved (a library song, a file, or neither yet) and all structural
    /// editing of its sections and lines.
    /// </summary>
    public class SongDocumentViewModel : ObservableObject
    {
        private string? _savedText;
        private bool _showNumerals;

        public SongDocumentViewModel(Song song, string? filePath = null, long? libraryId = null)
        {
            Song = song;
            Palette = new ChordPaletteViewModel(song);
            History = new UndoHistory(song);
            Find = new FindReplaceViewModel(song, Edit);
            song.PropertyChanged += (_, e) =>
            {
                if (e.PropertyName == nameof(Song.Key))
                {
                    OnPropertyChanged(nameof(NumeralKey));
                    OnPropertyChanged(nameof(KeyChoice));
                }
            };
            FilePath = filePath;
            LibraryId = libraryId;
            if (filePath != null || libraryId != null)
                _savedText = SongTextWriter.ToText(song);

            AddSectionCommand = new RelayCommand(() => Edit(AddSection));
            DeleteSectionCommand = new RelayCommand<Section>(section => Edit(() => Song.Sections.Remove(section)));
            MoveSectionUpCommand = new RelayCommand<Section>(section => Edit(() => MoveSection(section, -1)));
            MoveSectionDownCommand = new RelayCommand<Section>(section => Edit(() => MoveSection(section, 1)));
            DuplicateSectionCommand = new RelayCommand<Section>(section => Edit(() => DuplicateSection(section)));
            RepeatSectionCommand = new RelayCommand<Section>(section => Edit(() => Song.Sections.Add(new Section(section.Name, isRepeat: true))));
            AddLineCommand = new RelayCommand<Section>(section => Edit(() => AddLine(section)));
            TransposeUpCommand = new RelayCommand(() => Edit(() => Song.Transpose(1)));
            TransposeDownCommand = new RelayCommand(() => Edit(() => Song.Transpose(-1)));
            UndoCommand = new RelayCommand(History.Undo);
            RedoCommand = new RelayCommand(History.Redo);
        }

        public Song Song { get; }

        public ChordPaletteViewModel Palette { get; }

        public UndoHistory History { get; }

        public FindReplaceViewModel Find { get; }

        /// <summary>Show chords as Roman numerals in the song's key (display only; the song keeps chord names).</summary>
        public bool ShowNumerals
        {
            get => _showNumerals;
            set
            {
                if (SetProperty(ref _showNumerals, value))
                    OnPropertyChanged(nameof(NumeralKey));
            }
        }

        /// <summary>
        /// The key picked in the Key box: null when the song has no known key, so the box shows nothing
        /// (a value that isn't in the list would leave the previous tab's key on display). The box sends
        /// null back when it is cleared or switches songs; that never clears the song's key.
        /// </summary>
        public string? KeyChoice
        {
            get => MusicKeys.All.Contains(Song.Key) ? Song.Key : null;
            set
            {
                if (value != null)
                    Song.Key = value;
            }
        }

        /// <summary>The key chords are shown as numerals in, or empty to show chord names.</summary>
        public string NumeralKey => ShowNumerals ? Song.Key : "";

        /// <summary>The song file (.txt or ChordPro) this song was opened from or last saved to, if any.</summary>
        public string? FilePath { get; private set; }

        /// <summary>The library song this tab edits, if it is one (then <see cref="FilePath"/> is null).</summary>
        public long? LibraryId { get; private set; }

        public bool HasUnsavedChanges => _savedText == null ? Song.HasContent : SongTextWriter.ToText(Song) != _savedText;

        /// <summary>Asks the view to put the caret in a line (e.g. one that was just created).</summary>
        public event EventHandler<FocusRequest>? FocusRequested;

        public ICommand AddSectionCommand { get; }
        public ICommand DeleteSectionCommand { get; }
        public ICommand MoveSectionUpCommand { get; }
        public ICommand MoveSectionDownCommand { get; }
        public ICommand DuplicateSectionCommand { get; }
        /// <summary>Adds a repeat of the section at the end of the song.</summary>
        public ICommand RepeatSectionCommand { get; }
        public ICommand AddLineCommand { get; }
        public ICommand TransposeUpCommand { get; }
        public ICommand TransposeDownCommand { get; }
        public ICommand UndoCommand { get; }
        public ICommand RedoCommand { get; }

        /// <summary>Saves the song to a file, which becomes the song's home (it is no longer a library song).</summary>
        public void SaveTo(string path)
        {
            File.WriteAllText(path, SongFile.ToText(Song, path));
            FilePath = path;
            LibraryId = null;
            _savedText = SongTextWriter.ToText(Song);
        }

        /// <summary>Writes a copy of the song to a file; where the song is saved doesn't change.</summary>
        public void ExportTo(string path) => File.WriteAllText(path, SongFile.ToText(Song, path));

        /// <summary>Saves the song in the library: updates its library song, or adds it if it has none.</summary>
        public void SaveTo(SongLibrary library)
        {
            if (LibraryId is long id)
                library.UpdateSong(id, Song);
            else
                LibraryId = library.AddSong(Song);
            FilePath = null;
            _savedText = SongTextWriter.ToText(Song);
        }

        /// <summary>Called when the song was deleted from the library: the tab keeps it, as a song not saved anywhere.</summary>
        public void DetachFromLibrary()
        {
            LibraryId = null;
            _savedText = null;
        }

        private void AddSection()
        {
            var section = new Section("New Section");
            var line = new SongLine();
            section.Lines.Add(line);
            Song.Sections.Add(section);
            Focus(line, 0);
        }

        private void AddLine(Section section)
        {
            var line = new SongLine();
            section.Lines.Add(line);
            Focus(line, 0);
        }

        private void MoveSection(Section section, int direction)
        {
            int index = Song.Sections.IndexOf(section);
            int target = index + direction;
            if (target >= 0 && target < Song.Sections.Count)
                Song.Sections.Move(index, target);
        }

        private void DuplicateSection(Section section)
        {
            var copy = section.Clone();
            Song.Sections.Insert(Song.Sections.IndexOf(section) + 1, copy);
            if (copy.Lines.Count > 0)
                Focus(copy.Lines[0], 0);
        }

        /// <summary>Makes <paramref name="change"/> its own undo step, apart from any typing just before it.</summary>
        private void Edit(Action change)
        {
            History.Commit();
            change();
            History.Commit(mergeable: false);
        }

        // ---- Line editing ----

        public void SplitLine(SongLine line, int caret) => Edit(() => Split(line, caret));

        private void Split(SongLine line, int caret)
        {
            var section = SectionOf(line);
            var tail = line.SplitAt(caret);
            section.Lines.Insert(section.Lines.IndexOf(line) + 1, tail);
            Focus(tail, 0);
        }

        /// <summary>
        /// Backspace at the start of a line: joins it onto the previous line, or removes it if it's an empty first line.
        /// </summary>
        public void MergeWithPrevious(SongLine line) => Edit(() => Merge(line));

        private void Merge(SongLine line)
        {
            var section = SectionOf(line);
            int index = section.Lines.IndexOf(line);

            if (index > 0)
            {
                var previous = section.Lines[index - 1];
                int caret = previous.Text.Length;
                previous.Append(line);
                section.Lines.Remove(line);
                Focus(previous, caret);
            }
            else if (line.Text.Length == 0 && line.Chords.Count == 0 && section.Lines.Count > 1)
            {
                section.Lines.Remove(line);
                Focus(section.Lines[0], 0);
            }
        }

        public void MoveFocus(SongLine line, int direction, int caret)
        {
            var all = Song.Sections.SelectMany(s => s.Lines).ToList();
            int target = all.IndexOf(line) + direction;
            if (target >= 0 && target < all.Count)
                Focus(all[target], caret);
        }

        /// <summary>
        /// Pastes multi-line text: each row becomes a lyric line, a "[Name]" row starts a new section, and a row of
        /// chords (chords over lyrics, as on chord sites) puts those chords above the lyric row below it.
        /// </summary>
        public void PasteLines(SongLine line, int caret, string text) => Edit(() => Paste(line, caret, text));

        private void Paste(SongLine line, int caret, string text)
        {
            var section = SectionOf(line);
            var tail = line.SplitAt(caret);
            int insertAt = section.Lines.IndexOf(line) + 1;
            SongLine last = line;
            SongLine? pendingChords = null;   // a chord row waiting for the lyric row below it

            // Chord sites often line chords up with non-breaking spaces.
            var rows = text.Replace(' ', ' ').Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            for (int i = 0; i < rows.Length; i++)
            {
                string row = rows[i].TrimEnd();
                var heading = Regex.Match(row.Trim(), @"^\[(.+)\]$");

                if (heading.Success)
                {
                    // Lines after the insertion point belong after the new heading.
                    var newSection = new Section(heading.Groups[1].Value);
                    while (section.Lines.Count > insertAt)
                    {
                        var moved = section.Lines[insertAt];
                        section.Lines.RemoveAt(insertAt);
                        newSection.Lines.Add(moved);
                    }
                    Song.Sections.Insert(Song.Sections.IndexOf(section) + 1, newSection);
                    section = newSection;
                    insertAt = 0;
                    pendingChords = null;
                }
                else if (row.Trim().Length > 0 && SongTextReader.IsChordLine(row))
                {
                    // The first chord row goes into the line pasted into, if that line is still blank.
                    if (i == 0 && line.Text.Length == 0 && line.Chords.Count == 0)
                    {
                        last = line;
                    }
                    else
                    {
                        last = new SongLine();
                        section.Lines.Insert(insertAt++, last);
                    }
                    foreach (Match token in Regex.Matches(row, @"\S+"))
                        last.Chords.Add(new ChordPlacement(token.Index, token.Value));
                    pendingChords = last;
                }
                else if (pendingChords != null && row.Trim().Length > 0)
                {
                    pendingChords.Text = row;
                    pendingChords = null;
                }
                else if (i == 0)
                {
                    line.Text += row;
                }
                else if (row.Trim().Length > 0)
                {
                    last = new SongLine(row);
                    section.Lines.Insert(insertAt++, last);
                }
                else
                {
                    pendingChords = null;   // a blank row: the chords above were a chord-only line
                }
            }

            if (tail.Text.Length > 0 || tail.Chords.Count > 0)
                section.Lines.Insert(insertAt, tail);

            // Pasting a whole song into a blank line shouldn't leave that blank line (or its empty section) behind.
            if (line.Text.Length == 0 && line.Chords.Count == 0 && last != line)
            {
                var original = SectionOf(line);
                original.Lines.Remove(line);
                if (original.Lines.Count == 0)
                    Song.Sections.Remove(original);
            }

            Focus(last, last.Text.Length);
        }

        private Section SectionOf(SongLine line) => Song.Sections.First(s => s.Lines.Contains(line));

        private void Focus(SongLine line, int caret) => FocusRequested?.Invoke(this, new FocusRequest(line, caret));
    }
}
