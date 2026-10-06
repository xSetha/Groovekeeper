using System.Text;
using System.Text.RegularExpressions;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.IO
{
    /// <summary>
    /// Reads the ChordPro format: {directive: value} lines and lyrics with chords in brackets ("[G]Amazing").
    /// Sections come from start_of_…/end_of_… environments, from {comment:} headings, or from paragraphs
    /// separated by blank lines; in an environment, a blank line is a blank line of the song. {chorus} and a
    /// heading naming an earlier section with nothing under it are repeats. Directives the song has no place for (capo, tempo, …) are skipped.
    /// </summary>
    public static partial class ChordProReader
    {
        [GeneratedRegex(@"^\{\s*([A-Za-z_][\w-]*)\s*(?::\s*(.*?)|\s+(.*?))?\s*\}$")]
        private static partial Regex DirectiveRegex();

        // ChordPro 6 can also give a section's name as an attribute: {start_of_verse label="Verse 1"}.
        [GeneratedRegex(@"^label\s*=\s*""(.*)""$")]
        private static partial Regex LabelRegex();

        [GeneratedRegex(@"\[([^\]]*)\]")]
        private static partial Regex ChordRegex();

        public static Song Parse(string text)
        {
            var song = new Song();
            string subtitle = "";
            Section? section = null;
            bool inEnvironment = false;
            int verseCount = 0;
            string? lastChorus = null;
            // Sections started by a {comment:} heading rather than an environment.
            var headings = new HashSet<Section>();

            Section StartSection(string name)
            {
                var started = new Section(name);
                song.Sections.Add(started);
                return started;
            }

            foreach (string raw in text.Replace("\r\n", "\n").Split('\n'))
            {
                string line = raw.TrimEnd();
                string trimmed = line.Trim();

                if (trimmed.StartsWith('#'))
                    continue;
                if (trimmed.Length == 0)
                {
                    // A blank line ends a paragraph, but not an environment (where it's kept) or a heading still
                    // waiting for its lines.
                    if (inEnvironment && section != null)
                        section.Lines.Add(new SongLine());
                    else if (section?.Lines.Count > 0)
                        section = null;
                    continue;
                }

                var directive = DirectiveRegex().Match(trimmed);
                if (!directive.Success)
                {
                    if (section == null)
                        section = StartSection($"Verse {++verseCount}");
                    section.Lines.Add(ParseLyric(line));
                    continue;
                }

                string name = directive.Groups[1].Value.ToLowerInvariant();
                string value = Label(directive.Groups[2].Success ? directive.Groups[2].Value : directive.Groups[3].Value);
                switch (name)
                {
                    case "title" or "t":
                        song.Title = value;
                        break;
                    case "subtitle" or "st":
                        subtitle = value;
                        break;
                    case "artist":
                        song.Artist = value;
                        break;
                    case "key":
                        song.Key = value;
                        break;
                    case "chorus":
                        song.Sections.Add(new Section(value.Length > 0 ? value : lastChorus ?? "Chorus", isRepeat: true));
                        section = null;
                        inEnvironment = false;
                        break;
                    case "comment" or "c" or "comment_italic" or "ci" or "comment_box" or "cb" or "highlight":
                        if (inEnvironment && section != null)
                        {
                            section.Lines.Add(new SongLine(value));
                        }
                        else
                        {
                            section = StartSection(value);
                            headings.Add(section);
                        }
                        break;
                    default:
                        string? kind = EnvironmentKind(name);
                        if (kind == null && IsEnvironmentEnd(name))
                        {
                            section = null;
                            inEnvironment = false;
                        }
                        else if (kind != null)
                        {
                            // "{c: Chorus}" right before "{soc}" names the chorus rather than being a section of its own.
                            if (value.Length == 0 && section != null && headings.Contains(section) && section.Lines.Count == 0)
                            {
                                value = section.Name;
                                song.Sections.Remove(section);
                            }
                            if (kind == "verse")
                                verseCount++;
                            string sectionName = value.Length > 0 ? value : DefaultName(kind, verseCount);
                            if (kind == "chorus")
                                lastChorus = sectionName;
                            section = StartSection(sectionName);
                            inEnvironment = true;
                        }
                        break;
                }
            }

            if (song.Artist.Length == 0)
                song.Artist = subtitle;

            foreach (var heading in headings.Where(h => h.Lines.Count == 0))
            {
                // A bare heading naming an earlier section means "play it again".
                int index = song.Sections.IndexOf(heading);
                heading.IsRepeat = song.Sections.Take(index).Any(s => !s.IsRepeat && s.Name == heading.Name);
            }

            return song;
        }

        /// <summary>
        /// Splits "[G]Amazing [D]grace" into lyrics and chord positions. Bracketed text that isn't a chord
        /// (e.g. "[N.C.]") stays in the lyrics, so it isn't lost.
        /// </summary>
        public static SongLine ParseLyric(string text)
        {
            var line = new SongLine();
            var lyric = new StringBuilder();
            int taken = 0;
            foreach (Match match in ChordRegex().Matches(text))
            {
                lyric.Append(text, taken, match.Index - taken);
                taken = match.Index + match.Length;
                string chord = match.Groups[1].Value.Trim();
                if (Chord.IsValid(chord))
                    line.Chords.Add(new ChordPlacement(lyric.Length, chord));
                else
                    lyric.Append(match.Value);
            }
            lyric.Append(text, taken, text.Length - taken);
            line.Text = lyric.ToString().TrimEnd();
            return line;
        }

        private static string Label(string value)
        {
            var label = LabelRegex().Match(value.Trim());
            return (label.Success ? label.Groups[1].Value : value).Trim();
        }

        /// <summary>"verse" for start_of_verse or sov, …; null if the directive doesn't start a section.</summary>
        private static string? EnvironmentKind(string directive) => directive switch
        {
            "soc" => "chorus",
            "sov" => "verse",
            "sob" => "bridge",
            "sot" => "tab",
            "sog" => "grid",
            _ when directive.StartsWith("start_of_") && directive.Length > "start_of_".Length => directive["start_of_".Length..],
            _ => null,
        };

        private static bool IsEnvironmentEnd(string directive) =>
            directive is "eoc" or "eov" or "eob" or "eot" or "eog" || directive.StartsWith("end_of_");

        private static string DefaultName(string kind, int verseCount) => kind switch
        {
            "verse" => $"Verse {verseCount}",
            _ => char.ToUpperInvariant(kind[0]) + kind[1..],
        };
    }
}
