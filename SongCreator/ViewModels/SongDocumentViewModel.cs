using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Input;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.ViewModels
{
    public record FocusRequest(SongLine Line, int Caret);

    /// <summary>A place in the lyrics: before the letter at <paramref name="Index"/> of <paramref name="Line"/>.</summary>
    public record TextPosition(SongLine Line, int Index);

    /// <summary>Lyrics from <paramref name="Start"/> to <paramref name="End"/>, in song order.</summary>
    public record TextRange(TextPosition Start, TextPosition End);

    /// <summary>Where a song is saved.</summary>
    public enum SongHome
    {
        /// <summary>Not saved anywhere yet; Save adds it to the library.</summary>
        New,
        Library,
        File,
    }

    /// <summary>
    /// One open song (a tab): where it is saved (a library song, a file, or neither yet) and all structural
    /// editing of its sections and lines.
    /// </summary>
    public class SongDocumentViewModel : ObservableObject
    {
        private string? _savedText;
        private string? _filePath;
        private long? _libraryId;
        private bool _showNumerals;
        private TextRange? _selection;

        public SongDocumentViewModel(Song song, string? filePath = null, long? libraryId = null)
        {
            Song = song;
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
            _filePath = filePath;
            _libraryId = libraryId;
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
        public string? FilePath
        {
            get => _filePath;
            private set
            {
                if (SetProperty(ref _filePath, value))
                    OnHomeChanged();
            }
        }

        /// <summary>The library song this tab edits, if it is one (then <see cref="FilePath"/> is null).</summary>
        public long? LibraryId
        {
            get => _libraryId;
            private set
            {
                if (SetProperty(ref _libraryId, value))
                    OnHomeChanged();
            }
        }

        public SongHome Home => FilePath != null ? SongHome.File : LibraryId != null ? SongHome.Library : SongHome.New;

        /// <summary>Where the song is saved, in a word or two: "Library", the file's name, or "Not saved yet".</summary>
        public string HomeLabel =>
            FilePath != null ? Path.GetFileName(FilePath) : Home == SongHome.Library ? "Library" : "Not saved yet";

        public string HomeDescription => Home switch
        {
            SongHome.File => $"Saved as a file: {FilePath}",
            SongHome.Library => "Saved in your song library",
            _ => "Save (Ctrl+S) adds it to your song library",
        };

        public bool HasUnsavedChanges => _savedText == null ? Song.HasContent : SongTextWriter.ToText(Song) != _savedText;

        /// <summary>
        /// Lyrics selected across lines with the mouse, or null. (A selection within one line is that line's own.)
        /// </summary>
        public TextRange? Selection
        {
            get => _selection;
            private set => SetProperty(ref _selection, value);
        }

        /// <summary>
        /// The sections whose headings the selection deletes: those after the section it starts in, up to the one it
        /// ends in.
        /// </summary>
        public IReadOnlyList<Section> SectionsInSelection
        {
            get
            {
                if (Selection is not { } selection)
                    return [];
                int first = Song.Sections.IndexOf(SectionOf(selection.Start.Line));
                int last = Song.Sections.IndexOf(SectionOf(selection.End.Line));
                return Song.Sections.Skip(first + 1).Take(last - first).ToList();
            }
        }

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
        private void OnHomeChanged()
        {
            OnPropertyChanged(nameof(Home));
            OnPropertyChanged(nameof(HomeLabel));
            OnPropertyChanged(nameof(HomeDescription));
        }

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

        // ---- Selecting across lines ----

        /// <summary>Selects the lyrics between two places, given in either order.</summary>
        public void Select(TextPosition anchor, TextPosition active)
        {
            var lines = Song.Sections.SelectMany(s => s.Lines).ToList();
            int anchorLine = lines.IndexOf(anchor.Line);
            int activeLine = lines.IndexOf(active.Line);
            if (anchorLine < 0 || activeLine < 0)
                return;
            bool backwards = activeLine < anchorLine || (activeLine == anchorLine && active.Index < anchor.Index);
            Selection = backwards ? new TextRange(active, anchor) : new TextRange(anchor, active);
        }

        public void ClearSelection() => Selection = null;

        /// <summary>
        /// Deletes the selection and the chords above it, like deleting a selection in a text editor: the rest of its
        /// last line joins its first line, and the lines and section headings in between are deleted (what is left of
        /// the last section joins the first one).
        /// </summary>
        public void DeleteSelection()
        {
            if (Selection is not { } selection)
                return;
            // An undo since the selection was made may have replaced its lines.
            var lines = Song.Sections.SelectMany(s => s.Lines).ToList();
            if (lines.Contains(selection.Start.Line) && lines.Contains(selection.End.Line))
                Edit(() => Delete(selection));
            Selection = null;
        }

        private void Delete(TextRange range)
        {
            var (first, last) = (range.Start.Line, range.End.Line);
            var firstSection = SectionOf(first);
            var lastSection = SectionOf(last);
            int caret = Math.Min(range.Start.Index, first.Text.Length);

            // The first line keeps its head and gets the last line's tail. Everything after the first line in its
            // section goes, and so do the sections up to the last one; the lines after the last line move up.
            var kept = last.SplitAt(range.End.Index);
            first.SplitAt(range.Start.Index);
            first.Append(kept);
            if (first != last)
            {
                int firstIndex = firstSection.Lines.IndexOf(first);
                var rest = lastSection.Lines.Skip(lastSection.Lines.IndexOf(last) + 1).ToList();
                int lastSectionIndex = Song.Sections.IndexOf(lastSection);
                for (int i = lastSectionIndex; i > Song.Sections.IndexOf(firstSection); i--)
                    Song.Sections.RemoveAt(i);
                while (firstSection.Lines.Count > firstIndex + 1)
                    firstSection.Lines.RemoveAt(firstIndex + 1);
                foreach (var line in rest)
                    firstSection.Lines.Add(line);
            }
            Focus(first, caret);
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
