namespace SongCreator.Music
{
    /// <summary>
    /// Chord lists for the chord palette: the chords that fit a key, what usually comes next, and every chord type for a root.
    /// </summary>
    public static class ChordTheory
    {
        // (semitones above the tonic, chord quality): the seven scale chords, then the dominant seventh.
        private static readonly (int Offset, string Quality)[] MajorDegrees =
            [(0, ""), (2, "m"), (4, "m"), (5, ""), (7, ""), (9, "m"), (11, "dim"), (7, "7")];
        private static readonly (int Offset, string Quality)[] MinorDegrees =
            [(0, "m"), (2, "dim"), (3, ""), (5, "m"), (7, "m"), (8, ""), (10, ""), (7, "7")];

        // After each chord of DiatonicChords (by index), the chords of the key that commonly follow it.
        private static readonly int[][] MajorNext = [[3, 4, 5, 1], [4, 7, 3], [5, 3], [4, 0, 1, 7], [0, 5, 3], [3, 1, 4], [0, 2], [0, 5]];
        private static readonly int[][] MinorNext = [[3, 5, 6, 4], [7, 0], [5, 3, 6], [7, 0, 6], [0, 5], [6, 3, 2], [2, 0, 5], [0, 5]];

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

        /// <summary>
        /// Whether a chord is built on the key's scale: its root is a scale note and its triad matches
        /// (extensions don't matter, so Am7 fits G). In a minor key the major V (E in Am) fits too.
        /// </summary>
        public static bool FitsKey(string chord, string key) => DegreeIn(chord, key) >= 0;

        /// <summary>The chords that commonly follow <paramref name="chord"/> in the key, or none if it isn't in the key.</summary>
        public static IReadOnlyList<string> SuggestNext(string chord, string key)
        {
            int degree = DegreeIn(chord, key);
            if (degree < 0)
                return [];
            var chords = DiatonicChords(key);
            bool minor = key.Trim().EndsWith('m');
            return (minor ? MinorNext : MajorNext)[degree].Select(index => chords[index]).ToList();
        }

        /// <summary>Index of the chord in <see cref="DiatonicChords"/> by root and triad, or -1.</summary>
        private static int DegreeIn(string chord, string key)
        {
            if (!Chord.TryParse(chord.Trim(), out var parsed) || !MusicKeys.TryParse(key, out _, out _))
                return -1;
            var chords = DiatonicChords(key);
            for (int i = 0; i < chords.Count; i++)
            {
                var scaleChord = Chord.TryParse(chords[i], out var c) ? c : null;
                if (scaleChord != null && scaleChord.Root.PitchClass == parsed.Root.PitchClass && scaleChord.Triad == parsed.Triad)
                    return i;
            }
            return -1;
        }

        /// <summary>The key's tonic as spelled in <see cref="Roots"/> (e.g. "A#m" → "Bb"), or null for an unknown key.</summary>
        public static string? RootOf(string key) =>
            MusicKeys.TryParse(key, out var tonic, out _) ? Roots[tonic.PitchClass] : null;
    }
}
