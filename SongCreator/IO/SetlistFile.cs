using System.IO;
using System.Text.Json;

namespace SongCreator.IO
{
    /// <summary>A song in a setlist: its file and the key to play it in (empty: as written).</summary>
    public record SetlistEntry(string Path, string Key);

    public record Setlist(string Name, IReadOnlyList<SetlistEntry> Songs);

    /// <summary>
    /// Reads and writes .setlist files (JSON). Song paths are stored relative to the setlist file,
    /// so a folder of songs and its setlists can be moved together.
    /// </summary>
    public static class SetlistFile
    {
        private static readonly JsonSerializerOptions Options = new() { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        public static void Save(string path, Setlist setlist)
        {
            string folder = System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(path))!;
            var relative = setlist with
            {
                Songs = setlist.Songs.Select(song => song with { Path = System.IO.Path.GetRelativePath(folder, song.Path) }).ToList(),
            };
            File.WriteAllText(path, JsonSerializer.Serialize(relative, Options));
        }

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
                    Key = song.Key ?? "",
                }).ToList(),
            };
        }
    }
}
