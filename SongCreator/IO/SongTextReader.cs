using System.IO;
using System.Text.RegularExpressions;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.IO
{
    /// <summary>
    /// Reads the text format written by <see cref="SongTextWriter"/>: title and artist lines, a
    /// "Key: …" line, then "[Section]" headings with chord lines above lyric lines.
    /// Files from older versions have "Tuning: … · Key: …" there; the tuning is ignored.
    /// </summary>
    public static partial class SongTextReader
    {
        [GeneratedRegex(@"^\[(.+)\]$")]
        private static partial Regex HeadingRegex();

        [GeneratedRegex(@"\S+")]
        private static partial Regex TokenRegex();

        /// <summary>
        /// Reads a song file; a song without a title line is named after the file.
        /// Throws <see cref="IOException"/> or <see cref="UnauthorizedAccessException"/> if the file can't be read.
        /// </summary>
        public static Song Load(string path)
        {
            var song = Parse(File.ReadAllText(path));
            if (song.Title.Length == 0)
                song.Title = Path.GetFileNameWithoutExtension(path);
            return song;
        }

        public static Song Parse(string text)
        {
            var song = new Song();
            var headerLines = new List<string>();
            Section? section = null;
            SongLine? pendingChords = null;

            foreach (string raw in text.Replace("\r\n", "\n").Split('\n'))
            {
                string line = raw.TrimEnd();
                var heading = HeadingRegex().Match(line.Trim());

                if (heading.Success)
                {
                    section = new Section(heading.Groups[1].Value);
                    song.Sections.Add(section);
                    pendingChords = null;
                }
                else if (line.Trim().Length == 0)
                {
                    pendingChords = null;
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

                    if (IsChordLine(line))
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

            if (headerLines.Count > 0)
                song.Title = headerLines[0];
            if (headerLines.Count > 1)
                song.Artist = headerLines[1];

            // Every section needs a line to type into.
            foreach (var empty in song.Sections.Where(s => s.Lines.Count == 0))
                empty.Lines.Add(new SongLine());

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
