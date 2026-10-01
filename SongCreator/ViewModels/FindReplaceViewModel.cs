using System.Windows.Input;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.ViewModels
{
    public record FindMatch(SongLine Line, int Start, int Length);

    /// <summary>
    /// The find bar of one song. Searches the lyrics (ignoring case) or the chords (by exact name,
    /// so replacing "G" with "G7" leaves "Gm" alone).
    /// </summary>
    public class FindReplaceViewModel : ObservableObject
    {
        private readonly Song _song;
        private readonly Action<Action> _edit;
        private string _findText = "";
        private string _replaceText = "";
        private bool _searchChords;
        private bool _isOpen;
        private FindMatch? _currentMatch;

        /// <param name="edit">Runs a change to the song as one undo step.</param>
        public FindReplaceViewModel(Song song, Action<Action> edit)
        {
            _song = song;
            _edit = edit;
            FindNextCommand = new RelayCommand(FindNext);
            ReplaceAllCommand = new RelayCommand(ReplaceAll);
            CloseCommand = new RelayCommand(() => IsOpen = false);
        }

        public bool IsOpen
        {
            get => _isOpen;
            set
            {
                if (SetProperty(ref _isOpen, value))
                    OnPropertyChanged(nameof(HighlightText));
            }
        }

        public string FindText
        {
            get => _findText;
            set
            {
                if (SetProperty(ref _findText, value))
                {
                    CurrentMatch = null;
                    Refresh();
                }
            }
        }

        public string ReplaceText
        {
            get => _replaceText;
            set
            {
                if (SetProperty(ref _replaceText, value))
                    Refresh();
            }
        }

        /// <summary>False: search the lyrics. True: search the chords.</summary>
        public bool SearchChords
        {
            get => _searchChords;
            set
            {
                if (SetProperty(ref _searchChords, value))
                    Refresh();
            }
        }

        /// <summary>The text the editor highlights in the lyrics: empty unless the bar is open on lyrics.</summary>
        public string HighlightText => IsOpen && !SearchChords ? FindText : "";

        /// <summary>The lyric match last shown by <see cref="FindNext"/>, drawn stronger than the others.</summary>
        public FindMatch? CurrentMatch
        {
            get => _currentMatch;
            private set => SetProperty(ref _currentMatch, value);
        }

        public string Summary
        {
            get
            {
                if (FindText.Length == 0)
                    return "";
                if (SearchChords && ReplaceText.Length > 0 && !Chord.IsValid(ReplaceText))
                    return $"\"{ReplaceText}\" isn't a chord";
                int count = SearchChords ? MatchingChords().Count() : Lines.Sum(line => MatchesIn(line).Count);
                return count switch
                {
                    0 => "No matches",
                    1 => "1 match",
                    _ => $"{count} matches",
                };
            }
        }

        /// <summary>Asks the view to scroll a lyric match into view.</summary>
        public event EventHandler<FindMatch>? MatchFound;

        public ICommand FindNextCommand { get; }
        public ICommand ReplaceAllCommand { get; }
        public ICommand CloseCommand { get; }

        /// <summary>Shows the next lyric match after the last one, wrapping around to the start of the song.</summary>
        public void FindNext()
        {
            Refresh();
            if (SearchChords || FindText.Length == 0)
                return;

            var lines = Lines.ToList();
            if (lines.Count == 0)
                return;
            int first = CurrentMatch == null ? -1 : lines.IndexOf(CurrentMatch.Line);
            int from = first < 0 ? 0 : CurrentMatch!.Start + 1;
            first = Math.Max(first, 0);

            // Every line once, then the starting line again for matches before the last one.
            for (int i = 0; i <= lines.Count; i++)
            {
                var line = lines[(first + i) % lines.Count];
                int start = MatchesIn(line).FirstOrDefault(index => index >= from, -1);
                if (start >= 0)
                {
                    CurrentMatch = new FindMatch(line, start, FindText.Length);
                    MatchFound?.Invoke(this, CurrentMatch);
                    return;
                }
                from = 0;
            }
        }

        public void ReplaceAll()
        {
            if (FindText.Length == 0)
                return;
            if (SearchChords)
            {
                if (!Chord.IsValid(ReplaceText))
                    return;
                _edit(() =>
                {
                    foreach (var chord in MatchingChords().ToList())
                        chord.Name = ReplaceText;
                });
            }
            else
            {
                _edit(() =>
                {
                    foreach (var line in Lines)
                    {
                        // From the end, so earlier match positions stay valid.
                        foreach (int start in MatchesIn(line).AsEnumerable().Reverse())
                        {
                            line.ApplyTextChange(start, FindText.Length, ReplaceText.Length);
                            line.Text = line.Text.Remove(start, FindText.Length).Insert(start, ReplaceText);
                        }
                    }
                });
            }
            CurrentMatch = null;
            Refresh();
        }

        private void Refresh()
        {
            OnPropertyChanged(nameof(Summary));
            OnPropertyChanged(nameof(HighlightText));
        }

        private IEnumerable<SongLine> Lines => _song.Sections.SelectMany(s => s.Lines);

        private IEnumerable<ChordPlacement> MatchingChords() =>
            Lines.SelectMany(l => l.Chords).Where(c => c.Name == FindText);

        private List<int> MatchesIn(SongLine line) => MatchesIn(line.Text, FindText);

        /// <summary>Start of each match of <paramref name="find"/> in <paramref name="text"/>, ignoring case, not overlapping.</summary>
        public static List<int> MatchesIn(string text, string find)
        {
            var starts = new List<int>();
            if (find.Length == 0)
                return starts;
            int index = text.IndexOf(find, StringComparison.OrdinalIgnoreCase);
            while (index >= 0)
            {
                starts.Add(index);
                index = text.IndexOf(find, index + find.Length, StringComparison.OrdinalIgnoreCase);
            }
            return starts;
        }
    }
}
