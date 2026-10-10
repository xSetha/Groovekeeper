using System.Text.RegularExpressions;

namespace SongCreator.Music
{
    /// <summary>How chord names are shown: with letters (A B C) or with Do Re Mi.</summary>
    public enum NoteNaming
    {
        Letters,
        Solfege,
    }

    /// <summary>
    /// Do Re Mi Fa Sol La Si for C D E F G A B (fixed do). Songs always keep letters; this is only how chords are shown
    /// and a second way to type them: "Lam7/Sol" is "Am7/G". Only the root and the bass change, and the accidental
    /// follows the name ("Fa#", "Sib").
    /// </summary>
    public static partial class NoteNames
    {
        // By letter: C D E F G A B.
        private static readonly string[] Solfege = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];
        private const string LetterOrder = "CDEFGAB";

        // The names without accents; "Ré" is accepted too when typing. The accidental is the usual # or b.
        [GeneratedRegex(@"^(?<name>(?i:do|re|ré|mi|fa|sol|la|si))(?<accidental>[#b]?)(?<rest>.*)$")]
        private static partial Regex NoteRegex();

        /// <summary>
        /// A letter chord (or key, "Am") written in Do Re Mi. Anything that isn't a chord is returned as it is.
        /// </summary>
        public static string ToSolfege(string chord)
        {
            if (!Chord.TryParse(chord.Trim(), out var parsed))
                return chord;
            return Solfege[LetterOrder.IndexOf(parsed.Root.Letter)] + Accidental(parsed.Root) + parsed.Quality
                + (parsed.Bass is { } bass ? "/" + Solfege[LetterOrder.IndexOf(bass.Letter)] + Accidental(bass) : "");
        }

        /// <summary>
        /// A chord typed in Do Re Mi ("sol7", "Lam", "Sib/Re") as its letter chord ("G7", "Am", "Bb/D"), or null if it
        /// isn't one. Letter chords are not solfège, so they give null: try <see cref="Chord.IsValid"/> first. Chord
        /// files are never read this way: "Do", "La" and "Si" are common words in lyrics.
        /// </summary>
        public static string? FromSolfege(string text)
        {
            var match = NoteRegex().Match(text.Trim());
            if (!match.Success)
                return null;

            string rest = match.Groups["rest"].Value;
            string quality = rest, bass = "";
            int slash = rest.IndexOf('/');
            if (slash >= 0)
            {
                quality = rest[..slash];
                string? bassNote = BassFrom(rest[(slash + 1)..]);
                if (bassNote == null)
                    return null;
                bass = "/" + bassNote;
            }

            string chord = LetterOf(match) + quality + bass;
            return Chord.IsValid(chord) ? chord : null;
        }

        /// <summary>
        /// What a person typed as a chord, as the letter chord to keep: letters as they are, Do Re Mi turned into
        /// letters, and null if it is neither.
        /// </summary>
        public static string? Normalize(string text) => Chord.IsValid(text.Trim()) ? text.Trim() : FromSolfege(text);

        /// <summary>The chord as it is shown in the given naming.</summary>
        public static string Display(string chord, NoteNaming naming) =>
            naming == NoteNaming.Solfege ? ToSolfege(chord) : chord;

        // A bass note is a solfège name ("Re", "Sol#") or already a letter ("G").
        private static string? BassFrom(string text)
        {
            var match = NoteRegex().Match(text);
            if (match is { Success: true } && match.Groups["rest"].Length == 0)
                return LetterOf(match);
            return Regex.IsMatch(text, "^[A-G][#b]?$") ? text : null;
        }

        // "Ré" and "RÉ" are Re too: the regex took the name in any case.
        private static string LetterOf(Match match) =>
            LetterOrder[Array.FindIndex(Solfege, n => n.Equals(match.Groups["name"].Value.ToLowerInvariant().Replace('é', 'e'), StringComparison.OrdinalIgnoreCase))]
            + match.Groups["accidental"].Value;

        private static string Accidental(Note note) => note.Accidental > 0 ? "#" : note.Accidental < 0 ? "b" : "";
    }
}
