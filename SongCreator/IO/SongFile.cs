using System.IO;
using SongCreator.Models;

namespace SongCreator.IO
{
    /// <summary>
    /// Reads and writes song files in the format their extension names: ChordPro (.cho, .chopro, .chordpro, .pro)
    /// or the plain text format (.txt and anything else).
    /// </summary>
    public static class SongFile
    {
        public static readonly IReadOnlyList<string> ChordProExtensions = [".cho", ".chopro", ".chordpro", ".pro"];

        public static bool IsChordPro(string path) =>
            ChordProExtensions.Contains(Path.GetExtension(path), StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// Reads a song file; a song without a title is named after the file.
        /// Throws <see cref="IOException"/> or <see cref="UnauthorizedAccessException"/> if the file can't be read.
        /// </summary>
        public static Song Load(string path)
        {
            string text = File.ReadAllText(path);
            var song = IsChordPro(path) ? ChordProReader.Parse(text) : SongTextReader.Parse(text);
            if (song.Title.Length == 0)
                song.Title = Path.GetFileNameWithoutExtension(path);
            return song;
        }

        /// <summary>The song as it would be saved to <paramref name="path"/>.</summary>
        public static string ToText(Song song, string path) =>
            IsChordPro(path) ? ChordProWriter.ToText(song) : SongTextWriter.ToText(song);
    }
}
