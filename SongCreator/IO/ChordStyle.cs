namespace SongCreator.IO
{
    /// <summary>How chords are written in an exported PDF. The songs themselves always keep letters.</summary>
    public enum ChordStyle
    {
        /// <summary>A B C, as the song has them.</summary>
        Letters,

        /// <summary>Do Re Mi Fa Sol La Si.</summary>
        Solfege,

        /// <summary>I IV V in each song's key (a song without a key keeps letters).</summary>
        Numerals,
    }
}
