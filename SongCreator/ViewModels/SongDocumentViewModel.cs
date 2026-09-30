using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Input;
using SongCreator.IO;
using SongCreator.Models;

namespace SongCreator.ViewModels
{
    public record FocusRequest(SongLine Line, int Caret);

    /// <summary>
    /// One open song (a tab): its file state and all structural editing of its sections and lines.
    /// </summary>
    public class SongDocumentViewModel
    {
        private string? _savedText;

        public SongDocumentViewModel(Song song, string? filePath = null)
        {
            Song = song;
            Palette = new ChordPaletteViewModel(song);
            if (filePath != null)
            {
                FilePath = filePath;
                _savedText = SongTextWriter.ToText(song);
            }

            AddSectionCommand = new RelayCommand(AddSection);
            DeleteSectionCommand = new RelayCommand<Section>(section => Song.Sections.Remove(section));
            AddLineCommand = new RelayCommand<Section>(AddLine);
            TransposeUpCommand = new RelayCommand(() => Song.Transpose(1));
            TransposeDownCommand = new RelayCommand(() => Song.Transpose(-1));
        }

        public Song Song { get; }

        public ChordPaletteViewModel Palette { get; }

        /// <summary>The .txt file this song was opened from or last saved to, if any.</summary>
        public string? FilePath { get; private set; }

        public bool HasUnsavedChanges => _savedText == null ? Song.HasContent : SongTextWriter.ToText(Song) != _savedText;

        /// <summary>Asks the view to put the caret in a line (e.g. one that was just created).</summary>
        public event EventHandler<FocusRequest>? FocusRequested;

        public ICommand AddSectionCommand { get; }
        public ICommand DeleteSectionCommand { get; }
        public ICommand AddLineCommand { get; }
        public ICommand TransposeUpCommand { get; }
        public ICommand TransposeDownCommand { get; }

        public void SaveTo(string path)
        {
            string text = SongTextWriter.ToText(Song);
            File.WriteAllText(path, text);
            FilePath = path;
            _savedText = text;
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

        // ---- Line editing ----

        public void SplitLine(SongLine line, int caret)
        {
            var section = SectionOf(line);
            var tail = line.SplitAt(caret);
            section.Lines.Insert(section.Lines.IndexOf(line) + 1, tail);
            Focus(tail, 0);
        }

        /// <summary>
        /// Backspace at the start of a line: joins it onto the previous line, or removes it if it's an empty first line.
        /// </summary>
        public void MergeWithPrevious(SongLine line)
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
        /// Pastes multi-line text: each row becomes a lyric line, a "[Name]" row starts a new section.
        /// </summary>
        public void PasteLines(SongLine line, int caret, string text)
        {
            var section = SectionOf(line);
            var tail = line.SplitAt(caret);
            int insertAt = section.Lines.IndexOf(line) + 1;
            SongLine last = line;

            var rows = text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            for (int i = 0; i < rows.Length; i++)
            {
                string row = rows[i].TrimEnd();
                var heading = Regex.Match(row.Trim(), @"^\[(.+)\]$");

                if (i == 0 && !heading.Success)
                {
                    line.Text += row;
                }
                else if (heading.Success)
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
                }
                else if (row.Trim().Length > 0)
                {
                    last = new SongLine(row);
                    section.Lines.Insert(insertAt++, last);
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
