using System.IO;
using System.Text.Json;

namespace SongCreator.IO
{
    /// <summary>A song that was open: one from a library (by its id there), or one from a file.</summary>
    public record SessionSong(long? LibraryId, string? FilePath);

    /// <summary>
    /// The songs that were open when the app was closed, in tab order, for "reopen the songs that were open" in Settings.
    /// Only saved songs are in it. <see cref="Library"/> says which library the library ids belong to.
    /// </summary>
    public record Session(string? Library, IReadOnlyList<SessionSong> Songs, int Active)
    {
        public static string DefaultPath { get; } = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SongCreator", "session.json");

        /// <summary>Reads the session; a missing or unreadable file gives an empty one.</summary>
        public static Session Load(string path)
        {
            try
            {
                var session = JsonSerializer.Deserialize<Session>(File.ReadAllText(path));
                // A hand-edited file can hold a null where a song should be.
                return session is { Songs: not null } ? session with { Songs = session.Songs.Where(s => s != null).ToList() } : new Session(null, [], 0);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
            {
                return new Session(null, [], 0);
            }
        }

        /// <summary>Writes the session; failing to remember it isn't worth interrupting the user.</summary>
        public void Save(string path)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
                File.WriteAllText(path, JsonSerializer.Serialize(this));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // The next start shows the start page instead.
            }
        }
    }
}
