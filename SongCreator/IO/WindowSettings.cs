using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using SongCreator.Music;

namespace SongCreator.IO
{
    /// <summary>
    /// The main window's size, whether the library panel is open and how chords are written (letters or Do Re Mi),
    /// remembered between runs.
    /// </summary>
    public record WindowSettings(double Width, double Height, bool IsLibraryPanelOpen,
        [property: JsonConverter(typeof(JsonStringEnumConverter<NoteNaming>))] NoteNaming Naming = NoteNaming.Letters)
    {
        public const double DefaultWidth = 1200;
        public const double DefaultHeight = 900;

        public static WindowSettings Default { get; } = new(DefaultWidth, DefaultHeight, IsLibraryPanelOpen: true);

        public static string DefaultPath { get; } = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SongCreator", "window.json");

        /// <summary>Reads the settings; a missing or unreadable file gives <see cref="Default"/>.</summary>
        public static WindowSettings Load(string path)
        {
            try
            {
                var settings = JsonSerializer.Deserialize<WindowSettings>(File.ReadAllText(path));
                return settings is { Width: > 0, Height: > 0 } ? settings : Default;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
            {
                return Default;
            }
        }

        /// <summary>Writes the settings; failing to remember them isn't worth interrupting the user.</summary>
        public void Save(string path)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
                File.WriteAllText(path, JsonSerializer.Serialize(this));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // Next start uses the defaults instead.
            }
        }
    }
}
