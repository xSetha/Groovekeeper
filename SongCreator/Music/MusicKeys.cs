namespace SongCreator.Music
{
    public static class MusicKeys
    {
        private static readonly string[] Roots =
            ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];

        /// <summary>
        /// Every major and minor key, paired per root (C, Cm, C#, C#m, ...). Includes both sharp and flat
        /// spellings so any key produced by <see cref="ChordTransposer"/> is in the list.
        /// </summary>
        public static IReadOnlyList<string> All { get; } = Roots.SelectMany(root => new[] { root, root + "m" }).ToArray();
    }
}
