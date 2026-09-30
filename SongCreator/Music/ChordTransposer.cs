using System.Text.RegularExpressions;

namespace SongCreator.Music
{
    public static partial class ChordTransposer
    {
        private static readonly string[] Sharps = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        private static readonly string[] Flats = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

        [GeneratedRegex(@"^([A-G][#b]?)([^/]*)(?:/([A-G][#b]?))?$")]
        private static partial Regex ChordRegex();

        /// <summary>
        /// Shifts a chord such as "F#m7/C#" by the given number of semitones.
        /// Input that is not a recognizable chord is returned unchanged.
        /// </summary>
        public static string Transpose(string chord, int semitones)
        {
            var match = ChordRegex().Match(chord.Trim());
            if (!match.Success)
                return chord;

            string root = Shift(match.Groups[1].Value, semitones);
            string suffix = match.Groups[2].Value;
            string bass = match.Groups[3].Success ? "/" + Shift(match.Groups[3].Value, semitones) : "";
            return root + suffix + bass;
        }

        private static string Shift(string note, int semitones)
        {
            bool useFlats = note.EndsWith('b');
            int index = Array.IndexOf(useFlats ? Flats : Sharps, note);
            int shifted = ((index + semitones) % 12 + 12) % 12;
            return (useFlats ? Flats : Sharps)[shifted];
        }
    }
}
