using System.IO;
using System.Text.Json;

namespace SongCreator.IO
{
    /// <summary>A song in a setlist: its file. (The key these files can name for a song is ignored.)</summary>
    public record SetlistEntry(string Path);

    public record Setlist(string Name, IReadOnlyList<SetlistEntry> Songs);

    /// <summary>
    /// Reads .setlist files (JSON), the setlist format from before the library, so they can be imported.
    /// Song paths are stored relative to the setlist file.
    /// </summary>
    public static class SetlistFile
    {
        private static readonly JsonSerializerOptions Options = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        /// <summary>
        /// Reads a setlist with full song paths. Throws <see cref="IOException"/>, <see cref="UnauthorizedAccessException"/>
        /// or <see cref="JsonException"/> if the file can't be read.
        /// </summary>
        public static Setlist Load(string path)
        {
            string folder = System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(path))!;
            var setlist = JsonSerializer.Deserialize<Setlist>(File.ReadAllText(path), Options)
                ?? throw new JsonException("The setlist is empty.");
            return setlist with
            {
                Name = setlist.Name ?? "",
                Songs = (setlist.Songs ?? []).Select(song => song with
                {
                    Path = System.IO.Path.GetFullPath(System.IO.Path.Combine(folder, song.Path)),
                }).ToList(),
            };
        }
    }
}
