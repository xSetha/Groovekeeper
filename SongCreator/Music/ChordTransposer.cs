namespace SongCreator.Music
{
    public static class ChordTransposer
    {
        /// <summary>
        /// Shifts a chord such as "F#m7/C#" by the given number of semitones, spelling its notes with flats or
        /// sharps as <paramref name="useFlats"/> says (null: keep each note's own kind of accidental).
        /// Text that is not a valid <see cref="Chord"/> is returned unchanged.
        /// </summary>
        public static string Transpose(string chord, int semitones, bool? useFlats = null) =>
            Chord.TryParse(chord.Trim(), out var parsed) ? parsed.Transpose(semitones, useFlats).ToString() : chord;
    }
}
