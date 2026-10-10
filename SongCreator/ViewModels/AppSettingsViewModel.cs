using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// The options in Settings. Each change is applied at once, wherever the option is used, and handed to
    /// <c>save</c> (writing settings.json), so nothing needs confirming.
    /// </summary>
    public class AppSettingsViewModel : ObservableObject
    {
        // How big the editor's text is, as a multiple of its normal size.
        private const double SmallScale = 0.875;
        private const double LargeScale = 1.25;

        private readonly Action<AppSettings>? _save;
        private AppSettings _settings;

        /// <param name="save">Remembers the settings after each change; none (e.g. in tests) means they are only kept while the app runs.</param>
        public AppSettingsViewModel(AppSettings settings, Action<AppSettings>? save = null)
        {
            _settings = settings;
            _save = save;
        }

        public static IReadOnlyList<SettingChoice<TextSize>> TextSizes { get; } =
        [
            new(TextSize.Small, "Small"),
            new(TextSize.Normal, "Normal"),
            new(TextSize.Large, "Large"),
        ];

        public static IReadOnlyList<SettingChoice<PaperSize>> Papers { get; } =
        [
            new(PaperSize.A4, "A4"),
            new(PaperSize.Letter, "US Letter"),
        ];

        public static IReadOnlyList<SettingChoice<StartupMode>> Startups { get; } =
        [
            new(StartupMode.StartPage, "The start page"),
            new(StartupMode.ReopenSongs, "The songs that were open"),
        ];

        public ChordStyle ChordStyle
        {
            get => _settings.ChordStyle;
            set
            {
                Change(_settings with { ChordStyle = value });
                OnPropertyChanged(nameof(Naming));
                OnPropertyChanged(nameof(ChordExample));
            }
        }

        /// <summary>The chord style as the editor writes names: Do Re Mi only when that is chosen (Roman numerals keep letters here).</summary>
        public NoteNaming Naming => ChordStyle == ChordStyle.Solfege ? NoteNaming.Solfege : NoteNaming.Letters;

        /// <summary>A line of chords in the chosen style, for the Settings window to show what the choice does.</summary>
        public string ChordExample => ChordStyle switch
        {
            ChordStyle.Solfege => "Lam   Sol7   Do   Fa",
            ChordStyle.Numerals => "vi   V7   I   IV",
            _ => "Am   G7   C   F",
        };

        public TextSize TextSize
        {
            get => _settings.TextSize;
            set
            {
                Change(_settings with { TextSize = value });
                OnPropertyChanged(nameof(TextScale));
            }
        }

        public double TextScale => TextSize switch
        {
            TextSize.Small => SmallScale,
            TextSize.Large => LargeScale,
            _ => 1,
        };

        public bool IncludeTableOfContents
        {
            get => _settings.IncludeTableOfContents;
            set => Change(_settings with { IncludeTableOfContents = value });
        }

        public bool CollapseRepeats
        {
            get => _settings.CollapseRepeats;
            set => Change(_settings with { CollapseRepeats = value });
        }

        public bool OpenWhenDone
        {
            get => _settings.OpenWhenDone;
            set => Change(_settings with { OpenWhenDone = value });
        }

        public PaperSize Paper
        {
            get => _settings.Paper;
            set => Change(_settings with { Paper = value });
        }

        public bool CheckForUpdates
        {
            get => _settings.CheckForUpdates;
            set => Change(_settings with { CheckForUpdates = value });
        }

        public StartupMode Startup
        {
            get => _settings.Startup;
            set => Change(_settings with { Startup = value });
        }

        // Raises the property changed event for the option that differs (the caller's own name), then remembers all of them.
        private void Change(AppSettings changed, [System.Runtime.CompilerServices.CallerMemberName] string? option = null)
        {
            if (changed == _settings)
                return;
            _settings = changed;
            OnPropertyChanged(option);
            _save?.Invoke(_settings);
        }
    }
}
