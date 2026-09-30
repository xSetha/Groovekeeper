using System.Diagnostics.CodeAnalysis;
using System.Text.RegularExpressions;

namespace SongCreator.Music
{
    /// <summary>
    /// A spelled note name: a letter plus an optional sharp or flat ("F#", "Bb", "E#").
    /// </summary>
    public readonly record struct Note(char Letter, int Accidental)
    {
        private static readonly string[] Sharps = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        private static readonly string[] Flats = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

        /// <summary>0 = C … 11 = B. Rare spellings are handled too: E# = F, Cb = B.</summary>
        public int PitchClass => Mod12(Letter switch
        {
            'C' => 0,
            'D' => 2,
            'E' => 4,
            'F' => 5,
            'G' => 7,
            'A' => 9,
            _ => 11,   // B
        } + Accidental);

        public bool IsFlat => Accidental < 0;

        /// <summary>The usual name for a pitch, with sharps or flats (never E#, B#, Fb or Cb).</summary>
        public static Note FromPitch(int pitchClass, bool useFlats) =>
            Parse((useFlats ? Flats : Sharps)[Mod12(pitchClass)]);

        public Note Transpose(int semitones, bool useFlats) => FromPitch(PitchClass + semitones, useFlats);

        public override string ToString() => Letter + (Accidental > 0 ? "#" : Accidental < 0 ? "b" : "");

        internal static Note Parse(string text) =>
            new(text[0], text.Length > 1 ? (text[1] == '#' ? 1 : -1) : 0);

        private static int Mod12(int value) => (value % 12 + 12) % 12;
    }

    /// <summary>
    /// A chord name split into root, chord type and optional bass note ("F#m7/C#" → F#, "m7", C#).
    /// This is the single definition of a valid chord, used by the transposer, the file reader and the palette.
    /// </summary>
    public sealed partial record Chord(Note Root, string Quality, Note? Bass)
    {
        // Chord types are built from known parts so lyric words ("Every", "Day") are never taken for chords.
        [GeneratedRegex(@"^([A-G][#b]?)((?:maj|min|dim|aug|sus|add|m|M|\+|°|ø|\d|[#b]\d|\(|\))*)(?:/([A-G][#b]?))?$")]
        private static partial Regex ChordRegex();

        public static bool TryParse(string text, [NotNullWhen(true)] out Chord? chord)
        {
            var match = ChordRegex().Match(text);
            chord = match.Success
                ? new Chord(Note.Parse(match.Groups[1].Value), match.Groups[2].Value,
                    match.Groups[3].Success ? Note.Parse(match.Groups[3].Value) : null)
                : null;
            return chord != null;
        }

        public static bool IsValid(string text) => TryParse(text, out _);

        /// <summary>
        /// Moves the root and the bass by <paramref name="semitones"/>. The notes are spelled with flats or sharps
        /// as <paramref name="useFlats"/> says; when it is null, each note keeps its own kind of accidental.
        /// </summary>
        public Chord Transpose(int semitones, bool? useFlats) =>
            new(Root.Transpose(semitones, useFlats ?? Root.IsFlat),
                Quality,
                Bass is { } bass ? bass.Transpose(semitones, useFlats ?? bass.IsFlat) : null);

        public override string ToString() => $"{Root}{Quality}" + (Bass is { } bass ? $"/{bass}" : "");
    }
}
