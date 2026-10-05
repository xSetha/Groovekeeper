using System.Text;
using SongCreator.Models;

namespace SongCreator.IO
{
    /// <summary>
    /// Writes a song as plain monospace text: each chord line sits above its lyric line.
    /// </summary>
    public static class SongTextWriter
    {
        /// <summary>The line under a heading that marks the section as a repeat.</summary>
        public const string RepeatMarker = "(Repeat)";

        public static string ToText(Song song)
        {
            var text = new StringBuilder();
            if (song.Title.Length > 0)
                text.AppendLine(song.Title);
            if (song.Artist.Length > 0)
                text.AppendLine(song.Artist);

            if (song.Key.Length > 0)
            {
                if (text.Length > 0)
                    text.AppendLine();
                text.AppendLine($"Key: {song.Key}");
            }

            foreach (var section in song.Sections)
            {
                if (section.IsRepeat)
                {
                    if (text.Length > 0)
                        text.AppendLine();
                    text.AppendLine($"[{section.Name}]");
                    text.AppendLine(RepeatMarker);
                    continue;
                }

                // Every section and line is written, empty ones too, so the song reads back as it was.
                // A line with nothing on it is a blank line; the blank line before the next heading separates sections.
                if (text.Length > 0)
                    text.AppendLine();
                text.AppendLine($"[{section.Name}]");
                foreach (var line in section.Lines)
                {
                    bool hasText = line.Text.Trim().Length > 0;
                    if (line.Chords.Count > 0)
                        text.AppendLine(ChordLine(line));
                    if (hasText)
                        text.AppendLine(line.Text.TrimEnd());
                    else if (line.Chords.Count == 0)
                        text.AppendLine();
                }
            }
            return text.ToString();
        }

        /// <summary>
        /// Places each chord at its column; a chord that would overlap the previous one is pushed right.
        /// <paramref name="display"/> can write each chord differently (e.g. as a Roman numeral).
        /// </summary>
        public static string ChordLine(SongLine line, Func<string, string>? display = null)
        {
            var text = new StringBuilder();
            foreach (var chord in line.Chords.OrderBy(c => c.Position))
            {
                int padding = chord.Position - text.Length;
                if (text.Length > 0)
                    padding = Math.Max(padding, 1);
                text.Append(' ', Math.Max(padding, 0)).Append(display?.Invoke(chord.Name) ?? chord.Name);
            }
            return text.ToString();
        }
    }
}
