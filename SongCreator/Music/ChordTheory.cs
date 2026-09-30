namespace SongCreator.Music
{
    /// <summary>
    /// Chord lists for the chord palette: the chords that fit a key, and every chord type for a root.
    /// </summary>
    public static class ChordTheory
    {
        // (semitones above the tonic, chord quality): the seven scale chords, then the dominant seventh.
        private static readonly (int Offset, string Quality)[] MajorDegrees =
            [(0, ""), (2, "m"), (4, "m"), (5, ""), (7, ""), (9, "m"), (11, "dim"), (7, "7")];
        private static readonly (int Offset, string Quality)[] MinorDegrees =
            [(0, "m"), (2, "dim"), (3, ""), (5, "m"), (7, "m"), (8, ""), (10, ""), (7, "7")];

        /// <summary>The roots offered by the palette, in their most common spelling.</summary>
        public static IReadOnlyList<string> Roots { get; } = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

        /// <summary>The chord types offered for each root ("" is the major triad).</summary>
        public static IReadOnlyList<string> Qualities { get; } = ["", "m", "7", "m7", "maj7", "6", "9", "sus2", "sus4", "add9", "dim", "aug"];

        /// <summary>
        /// The chords built on a key's scale (e.g. G → G Am Bm C D Em F#dim D7), or none for an unknown key.
        /// </summary>
        public static IReadOnlyList<string> DiatonicChords(string key)
        {
            if (!MusicKeys.TryParse(key, out var tonic, out bool minor))
                return [];
            bool useFlats = MusicKeys.UsesFlats(key) == true;
            return (minor ? MinorDegrees : MajorDegrees)
                .Select(degree => Note.FromPitch(tonic.PitchClass + degree.Offset, useFlats) + degree.Quality)
                .ToList();
        }

        /// <summary>The key's tonic as spelled in <see cref="Roots"/> (e.g. "A#m" → "Bb"), or null for an unknown key.</summary>
        public static string? RootOf(string key) =>
            MusicKeys.TryParse(key, out var tonic, out _) ? Roots[tonic.PitchClass] : null;
    }
}
