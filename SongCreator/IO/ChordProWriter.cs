using System.Text;
using SongCreator.Models;

namespace SongCreator.IO
{
    /// <summary>
    /// Writes a song in the ChordPro format: {title:}/{artist:}/{key:} directives, sections as
    /// start_of_…/end_of_… environments, and each chord in brackets just before the letter it belongs to.
    /// </summary>
    public static class ChordProWriter
    {
        public static string ToText(Song song)
        {
            var text = new StringBuilder();
            if (song.Title.Length > 0)
                text.AppendLine($"{{title: {song.Title}}}");
            if (song.Artist.Length > 0)
                text.AppendLine($"{{artist: {song.Artist}}}");
            if (song.Key.Length > 0)
                text.AppendLine($"{{key: {song.Key}}}");

            foreach (var section in song.Sections)
            {
                if (section.IsRepeat)
                {
                    if (text.Length > 0)
                        text.AppendLine();
                    // ChordPro can only recall a chorus; other repeats are a heading with nothing under it.
                    text.AppendLine(IsChorus(section.Name) ? $"{{chorus: {section.Name}}}" : $"{{comment: {section.Name}}}");
                    continue;
                }

                var lines = section.Lines.Where(l => l.Text.Trim().Length > 0 || l.Chords.Count > 0).ToList();
                if (lines.Count == 0)
                    continue;
                if (text.Length > 0)
                    text.AppendLine();
                string environment = EnvironmentOf(section.Name);
                text.AppendLine($"{{start_of_{environment}: {section.Name}}}");
                foreach (var line in lines)
                    text.AppendLine(InlineChords(line));
                text.AppendLine($"{{end_of_{environment}}}");
            }
            return text.ToString();
        }

        /// <summary>The lyric with each chord inserted as "[G]" at its position; chords past the end are padded out.</summary>
        public static string InlineChords(SongLine line)
        {
            var text = new StringBuilder();
            int column = 0;   // lyric characters written so far (brackets don't count)
            foreach (var chord in line.Chords.OrderBy(c => c.Position))
            {
                int lyricEnd = Math.Min(chord.Position, line.Text.Length);
                if (lyricEnd > column)
                {
                    text.Append(line.Text, column, lyricEnd - column);
                    column = lyricEnd;
                }
                if (chord.Position > column)
                {
                    text.Append(' ', chord.Position - column);
                    column = chord.Position;
                }
                text.Append('[').Append(chord.Name).Append(']');
            }
            if (column < line.Text.Length)
                text.Append(line.Text, column, line.Text.Length - column);
            return text.ToString().TrimEnd();
        }

        private static bool IsChorus(string name) => name.StartsWith("Chorus", StringComparison.OrdinalIgnoreCase);

        private static string EnvironmentOf(string name) =>
            IsChorus(name) ? "chorus" : name.StartsWith("Bridge", StringComparison.OrdinalIgnoreCase) ? "bridge" : "verse";
    }
}
