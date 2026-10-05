namespace SongCreator.Models
{
    /// <summary>
    /// A note floating over the song in the editor, at a spot of its own: it isn't attached to a line, so it stays put
    /// while the lyrics under it change. Notes aren't part of the song's text (.txt or ChordPro); the library keeps them
    /// beside it, and the PDF prints them where they float.
    /// </summary>
    public class SongNote : ObservableObject
    {
        private string _text;
        private double _column;
        private double _top;

        public SongNote(string text, double column, double top, double printRow = 0)
        {
            _text = text;
            _column = column;
            _top = top;
            PrintRow = printRow;
        }

        /// <summary>The note's text; it may have several lines.</summary>
        public string Text
        {
            get => _text;
            set => SetProperty(ref _text, value);
        }

        /// <summary>Where the note starts across the song, in character columns from the start of the lyrics.</summary>
        public double Column
        {
            get => _column;
            set => SetProperty(ref _column, value);
        }

        /// <summary>Where the note's top is in the editor, in pixels from the top of the song's first section.</summary>
        public double Top
        {
            get => _top;
            set => SetProperty(ref _top, value);
        }

        /// <summary>
        /// What the note's top was over the last time the editor laid the song out, for the PDF: a line's index among the
        /// song's lines plus how far down towards the next line (e.g. 3.5 is halfway between lines 3 and 4). It follows
        /// <see cref="Top"/> and the lines, so it isn't an edit of its own (no change notification, no undo step).
        /// </summary>
        public double PrintRow { get; set; }

        public SongNote Clone() => new(Text, Column, Top, PrintRow);

        /// <summary>
        /// The <see cref="PrintRow"/> for a spot <paramref name="top"/> pixels down, given where each line starts and how
        /// tall it is: the line it's on plus how far towards the next one. Above the first line it is negative, measured
        /// in that line's height; past the last line it counts on in the last line's height.
        /// </summary>
        public static double RowAt(IReadOnlyList<(double Top, double Height)> lines, double top)
        {
            if (lines.Count == 0)
                return 0;
            if (top < lines[0].Top)
                return (top - lines[0].Top) / Math.Max(1, lines[0].Height);
            for (int i = 0; i < lines.Count - 1; i++)
            {
                if (top < lines[i + 1].Top)
                    return i + (top - lines[i].Top) / Math.Max(1, lines[i + 1].Top - lines[i].Top);
            }
            var last = lines[^1];
            return lines.Count - 1 + (top - last.Top) / Math.Max(1, last.Height);
        }
    }
}
