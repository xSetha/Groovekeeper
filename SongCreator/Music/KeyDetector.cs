namespace SongCreator.Music
{
    /// <summary>
    /// Guesses a song's key from its chords: the key whose scale fits the most chords,
    /// with a bonus when the song starts or ends on that key's tonic chord.
    /// </summary>
    public static class KeyDetector
    {
        // Below this share of chords fitting the best key, the song doesn't sound like any one key.
        private const double MinimumFit = 0.6;

        /// <summary>The likely key (as named in <see cref="MusicKeys.All"/>), or null if there are no chords or no clear key.</summary>
        public static string? Detect(IReadOnlyList<string> chords)
        {
            var valid = chords.Where(Chord.IsValid).ToList();
            if (valid.Count == 0)
                return null;

            string? best = null;
            double bestScore = 0;
            foreach (string key in Candidates())
            {
                int fits = valid.Count(chord => ChordTheory.FitsKey(chord, key));
                if (fits < valid.Count * MinimumFit)
                    continue;
                double score = fits + (IsTonic(valid[0], key) ? 2 : 0) + (IsTonic(valid[^1], key) ? 2 : 0);
                if (score > bestScore)
                {
                    best = key;
                    bestScore = score;
                }
            }
            return best;
        }

        /// <summary>Every major key, then every minor key, each with its usual name; ties go to the first.</summary>
        private static IEnumerable<string> Candidates() =>
            Enumerable.Range(0, 12).Select(pitch => MusicKeys.Transpose("C", pitch))
                .Concat(Enumerable.Range(0, 12).Select(pitch => MusicKeys.Transpose("Cm", pitch)));

        private static bool IsTonic(string chord, string key) =>
            Chord.TryParse(chord, out var parsed) && ChordTheory.DiatonicChords(key)[0] is var tonic &&
            Chord.TryParse(tonic, out var tonicChord) &&
            parsed.Root.PitchClass == tonicChord.Root.PitchClass && parsed.Triad == tonicChord.Triad;
    }
}
