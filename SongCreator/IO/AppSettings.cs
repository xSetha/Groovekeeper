using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace SongCreator.IO
{
    /// <summary>How big the lyrics and chords are in the editor.</summary>
    public enum TextSize
    {
        Small,
        Normal,
        Large,
    }

    /// <summary>The paper an exported PDF is made for.</summary>
    public enum PaperSize
    {
        A4,
        Letter,
    }

    /// <summary>What the app shows when it starts.</summary>
    public enum StartupMode
    {
        /// <summary>The start page.</summary>
        StartPage,

        /// <summary>The songs that were open when the app was closed.</summary>
        ReopenSongs,
    }

    /// <summary>
    /// The options in Settings, remembered between runs in settings.json. Every option has a default, so a file from an
    /// older version, or one with a value that isn't known, still gives the other options as they were set.
    /// </summary>
    public record AppSettings
    {
        /// <summary>How chords are written in the editor, and the default for exports. Songs always keep letters.</summary>
        public ChordStyle ChordStyle { get; init; } = ChordStyle.Letters;

        public TextSize TextSize { get; init; } = TextSize.Normal;

        public bool IncludeTableOfContents { get; init; } = true;

        public bool CollapseRepeats { get; init; } = true;

        public bool OpenWhenDone { get; init; } = true;

        public PaperSize Paper { get; init; } = PaperSize.A4;

        public bool CheckForUpdates { get; init; } = true;

        public StartupMode Startup { get; init; } = StartupMode.StartPage;

        public static string DefaultPath { get; } = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SongCreator", "settings.json");

        private static readonly JsonSerializerOptions WriteOptions = new()
        {
            WriteIndented = true,
            Converters = { new JsonStringEnumConverter() },
        };

        /// <summary>Reads the settings; a missing or unreadable file gives the defaults, and an option that isn't valid keeps its default.</summary>
        public static AppSettings Load(string path)
        {
            try
            {
                if (JsonNode.Parse(File.ReadAllText(path)) is not JsonObject file)
                    return new AppSettings();
                var defaults = new AppSettings();
                return new AppSettings
                {
                    ChordStyle = Read(file, nameof(ChordStyle), defaults.ChordStyle),
                    TextSize = Read(file, nameof(TextSize), defaults.TextSize),
                    IncludeTableOfContents = Read(file, nameof(IncludeTableOfContents), defaults.IncludeTableOfContents),
                    CollapseRepeats = Read(file, nameof(CollapseRepeats), defaults.CollapseRepeats),
                    OpenWhenDone = Read(file, nameof(OpenWhenDone), defaults.OpenWhenDone),
                    Paper = Read(file, nameof(Paper), defaults.Paper),
                    CheckForUpdates = Read(file, nameof(CheckForUpdates), defaults.CheckForUpdates),
                    Startup = Read(file, nameof(Startup), defaults.Startup),
                };
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
            {
                return new AppSettings();
            }
        }

        /// <summary>Writes the settings; failing to remember them isn't worth interrupting the user.</summary>
        public void Save(string path)
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
                File.WriteAllText(path, JsonSerializer.Serialize(this, WriteOptions));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // The option still applies until the app closes.
            }
        }

        // One option: its value, or the default if it's missing or the wrong kind or name.
        private static T Read<T>(JsonObject file, string name, T fallback)
        {
            try
            {
                if (file[name] is not JsonNode node)
                    return fallback;
                if (typeof(T).IsEnum)
                    return Enum.TryParse(typeof(T), node.GetValue<string>(), ignoreCase: true, out object? value) && Enum.IsDefined(typeof(T), value!)
                        ? (T)value!
                        : fallback;
                return node.GetValue<T>();
            }
            catch (Exception ex) when (ex is InvalidOperationException or FormatException)
            {
                return fallback;
            }
        }
    }
}
