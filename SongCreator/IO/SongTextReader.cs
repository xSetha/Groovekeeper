using System.Text.RegularExpressions;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.IO
{
    /// <summary>
    /// Reads the text format written by <see cref="SongTextWriter"/>: title and artist lines, a
    /// "Key: …" line, then "[Section]" headings with chord lines above lyric lines. A heading followed by
    /// "(Repeat)" is a repeat of that section. One blank line separates sections; other blank lines in a section
    /// are blank lines of the song.
    /// Files from older versions have "Tuning: … · Key: …" there; the tuning is ignored.
    /// </summary>
    public static partial class SongTextReader
    {
        [GeneratedRegex(@"^\[(.+)\]$")]
        private static partial Regex HeadingRegex();

        [GeneratedRegex(@"\S+")]
        private static partial Regex TokenRegex();

        public static Song Parse(string text)
        {
            var song = new Song();
            var headerLines = new List<string>();
            Section? section = null;
            SongLine? pendingChords = null;
            int blankLines = 0;   // blank lines in a section not yet added: the last one before a heading separates

            void AddBlankLines(int count)
            {
                for (int i = 0; i < count; i++)
                    section!.Lines.Add(new SongLine());
                blankLines = 0;
            }

            var rows = text.Replace("\r\n", "\n").Split('\n').ToList();
            if (rows.Count > 0 && rows[^1].Length == 0)
                rows.RemoveAt(rows.Count - 1);   // the newline that ends the last line
            foreach (string raw in rows)
            {
                string line = raw.TrimEnd();
                var heading = HeadingRegex().Match(line.Trim());

                if (heading.Success)
                {
                    if (section != null)
                        AddBlankLines(Math.Max(0, blankLines - 1));
                    section = new Section(heading.Groups[1].Value);
                    song.Sections.Add(section);
                    pendingChords = null;
                }
                else if (line.Trim().Length == 0)
                {
                    pendingChords = null;
                    if (section != null)
                        blankLines++;
                }
                else if (section == null && headerLines.Count < 2 && !IsInfoLine(line))
                {
                    headerLines.Add(line.Trim());
                }
                else if (section == null && IsInfoLine(line))
                {
                    ReadInfo(song, line);
                }
                else
                {
                    if (section == null)
                    {
                        section = new Section("Verse 1");
                        song.Sections.Add(section);
                    }
                    AddBlankLines(blankLines);

                    if (section.Lines.Count == 0 && line.Trim() == SongTextWriter.RepeatMarker)
                    {
                        section.IsRepeat = true;
                    }
                    else if (IsChordLine(line))
                    {
                        pendingChords = new SongLine();
                        foreach (Match token in TokenRegex().Matches(line))
                            pendingChords.Chords.Add(new ChordPlacement(token.Index, token.Value));
                        section.Lines.Add(pendingChords);
                    }
                    else if (pendingChords != null)
                    {
                        pendingChords.Text = line;
                        pendingChords = null;
                    }
                    else
                    {
                        section.Lines.Add(new SongLine(line));
                    }
                }
            }

            if (section != null)
                AddBlankLines(blankLines);

            if (headerLines.Count > 0)
                song.Title = headerLines[0];
            if (headerLines.Count > 1)
                song.Artist = headerLines[1];

            return song;
        }

        public static bool IsChordLine(string line)
        {
            var tokens = TokenRegex().Matches(line);
            return tokens.Count > 0 && tokens.All(t => Chord.IsValid(t.Value));
        }

        private static bool IsInfoLine(string line)
        {
            string trimmed = line.Trim();
            return trimmed.StartsWith("Tuning:") || trimmed.StartsWith("Key:");
        }

        private static void ReadInfo(Song song, string line)
        {
            foreach (string part in line.Split('·'))
            {
                string field = part.Trim();
                if (field.StartsWith("Key:"))
                    song.Key = field["Key:".Length..].Trim();
            }
        }
    }
}
