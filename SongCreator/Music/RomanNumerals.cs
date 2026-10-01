namespace SongCreator.Music
{
    /// <summary>
    /// Writes a chord as a Roman numeral relative to a key: uppercase for major, lowercase for minor,
    /// ° for diminished, + for augmented ("Am7" in G → "ii7"). Chords outside the scale get a flat or sharp
    /// ("F" in G → "bVII"); minor keys are counted the same way from their tonic ("C" in Am → "bIII").
    /// A bass note is written as its scale degree ("G/B" in G → "I/3").
    /// </summary>
    public static class RomanNumerals
    {
        private static readonly string[] Numerals = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];
        private static readonly string[] Degrees = ["1", "b2", "2", "b3", "3", "4", "#4", "5", "b6", "6", "b7", "7"];

        /// <summary>The numeral for <paramref name="chord"/> in <paramref name="key"/>, or null if either isn't valid.</summary>
        public static string? Of(string chord, string key)
        {
            if (!Chord.TryParse(chord.Trim(), out var parsed) || !MusicKeys.TryParse(key, out var tonic, out _))
                return null;

            string numeral = Numerals[Interval(tonic, parsed.Root)];
            string rest = parsed.Quality;
            switch (parsed.Triad)
            {
                case Triad.Minor:
                    numeral = numeral.ToLowerInvariant();
                    rest = StripPrefix(rest, "min", "m");
                    break;
                case Triad.Diminished:
                    numeral = numeral.ToLowerInvariant();
                    // Half-diminished keeps its own sign; the others are written with °.
                    if (rest.StartsWith('ø'))
                        break;
                    rest = rest.StartsWith("m7b5") ? "ø7" + rest["m7b5".Length..] : "°" + StripPrefix(rest, "dim", "°");
                    break;
                case Triad.Augmented:
                    rest = "+" + StripPrefix(rest, "aug", "+");
                    break;
            }

            string bass = parsed.Bass is { } bassNote ? "/" + Degrees[Interval(tonic, bassNote)] : "";
            return numeral + rest + bass;
        }

        private static int Interval(Note tonic, Note note) => (note.PitchClass - tonic.PitchClass + 12) % 12;

        private static string StripPrefix(string text, params string[] prefixes)
        {
            foreach (string prefix in prefixes)
                if (text.StartsWith(prefix))
                    return text[prefix.Length..];
            return text;
        }
    }
}
