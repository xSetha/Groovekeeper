namespace SongCreator.Controls
{
    /// <summary>
    /// Drag-and-drop data format for a chord name dragged from the chord palette onto a lyric line.
    /// A private format (not plain text) so lyric text boxes don't paste the name into the lyrics.
    /// </summary>
    public static class ChordDrag
    {
        public const string Format = "SongCreator.Chord";
    }
}
