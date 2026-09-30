namespace SongCreator.Music
{
    public static class MusicKeys
    {
        private static readonly string[] Roots =
            ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];

        // The name a key gets after transposing, per pitch class: the spelling most songbooks use.
        private static readonly string[] MajorNames = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
        private static readonly string[] MinorNames = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

        // Keys without a flat in their name whose scales are still written with flats.
        private static readonly HashSet<string> NaturalFlatKeys = ["F", "Dm", "Gm", "Cm", "Fm"];

        /// <summary>
        /// Every major and minor key, paired per root (C, Cm, C#, C#m, ...), with both sharp and flat spellings.
        /// </summary>
        public static IReadOnlyList<string> All { get; } = Roots.SelectMany(root => new[] { root, root + "m" }).ToArray();

        /// <summary>Reads a key from <see cref="All"/> (e.g. "Bbm" → Bb, minor).</summary>
        public static bool TryParse(string key, out Note tonic, out bool minor)
        {
            key = key.Trim();
            minor = key.EndsWith('m');
            tonic = default;
            if (!All.Contains(key))
                return false;
            tonic = Note.Parse(minor ? key[..^1] : key);
            return true;
        }

        /// <summary>Whether a key's scale is written with flats; null for an unknown key.</summary>
        public static bool? UsesFlats(string key) =>
            TryParse(key, out var tonic, out _) ? tonic.IsFlat || NaturalFlatKeys.Contains(key.Trim()) : null;

        /// <summary>Moves a key by some semitones and gives it its usual name (C + 1 → Db). Unknown keys are unchanged.</summary>
        public static string Transpose(string key, int semitones)
        {
            if (!TryParse(key, out var tonic, out bool minor))
                return key;
            int pitch = ((tonic.PitchClass + semitones) % 12 + 12) % 12;
            return minor ? MinorNames[pitch] : MajorNames[pitch];
        }
    }
}
