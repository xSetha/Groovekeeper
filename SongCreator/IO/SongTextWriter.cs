using System.Text;
using SongCreator.Models;

namespace SongCreator.IO
{
    /// <summary>
    /// Writes a song as plain monospace text: each chord line sits above its lyric line.
    /// </summary>
    public static class SongTextWriter
    {
        public static string ToText(Song song)
        {
            var text = new StringBuilder();
            if (song.Title.Length > 0)
                text.AppendLine(song.Title);
            if (song.Artist.Length > 0)
                text.AppendLine(song.Artist);

            var info = new List<string>();
            if (song.Tuning.Length > 0)
                info.Add($"Tuning: {song.Tuning}");
            if (song.Key.Length > 0)
                info.Add($"Key: {song.Key}");
            if (info.Count > 0)
            {
                if (text.Length > 0)
                    text.AppendLine();
                text.AppendLine(string.Join(" · ", info));
            }

            foreach (var section in song.Sections)
            {
                var lines = section.Lines.Where(l => l.Text.Trim().Length > 0 || l.Chords.Count > 0).ToList();
                if (lines.Count == 0)
                    continue;
                if (text.Length > 0)
                    text.AppendLine();
                text.AppendLine($"[{section.Name}]");
                foreach (var line in lines)
                {
                    if (line.Chords.Count > 0)
                        text.AppendLine(ChordLine(line));
                    if (line.Text.Trim().Length > 0)
                        text.AppendLine(line.Text.TrimEnd());
                }
            }
            return text.ToString();
        }

        /// <summary>
        /// Places each chord at its column; a chord that would overlap the previous one is pushed right.
        /// </summary>
        public static string ChordLine(SongLine line)
        {
            var text = new StringBuilder();
            foreach (var chord in line.Chords.OrderBy(c => c.Position))
            {
                int padding = chord.Position - text.Length;
                if (text.Length > 0)
                    padding = Math.Max(padding, 1);
                text.Append(' ', Math.Max(padding, 0)).Append(chord.Name);
            }
            return text.ToString();
        }
    }
}
