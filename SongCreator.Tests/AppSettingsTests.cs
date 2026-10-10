using System.IO;
using SongCreator.IO;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class AppSettingsTests : IDisposable
    {
        private readonly string _dir = Directory.CreateTempSubdirectory("SongCreatorTests").FullName;

        public void Dispose() => Directory.Delete(_dir, recursive: true);

        [Fact]
        public void StartsWithTheDefaultsWhenThereIsNoFile()
        {
            var settings = AppSettings.Load(Path.Combine(_dir, "missing.json"));

            Assert.Equal(new AppSettings(), settings);
            Assert.Equal(ChordStyle.Letters, settings.ChordStyle);
            Assert.Equal(TextSize.Normal, settings.TextSize);
            Assert.True(settings.IncludeTableOfContents && settings.CollapseRepeats && settings.OpenWhenDone);
            Assert.Equal(PaperSize.A4, settings.Paper);
            Assert.True(settings.CheckForUpdates);
            Assert.Equal(StartupMode.StartPage, settings.Startup);
        }

        [Fact]
        public void RemembersEveryOption()
        {
            string path = Path.Combine(_dir, "settings", "settings.json");
            var changed = new AppSettings
            {
                ChordStyle = ChordStyle.Solfege, TextSize = TextSize.Large, IncludeTableOfContents = false,
                CollapseRepeats = false, OpenWhenDone = false, Paper = PaperSize.Letter, CheckForUpdates = false,
                Startup = StartupMode.ReopenSongs,
            };

            changed.Save(path);

            Assert.Equal(changed, AppSettings.Load(path));
            Assert.Contains("\"Solfege\"", File.ReadAllText(path));   // by name, so the file can be read and edited
        }

        [Fact]
        public void AFileWithOnlySomeOptionsKeepsTheRestAtTheirDefaults()
        {
            string path = Path.Combine(_dir, "settings.json");
            File.WriteAllText(path, """{ "ChordStyle": "Numerals" }""");

            Assert.Equal(new AppSettings { ChordStyle = ChordStyle.Numerals }, AppSettings.Load(path));
        }

        [Fact]
        public void AnOptionThatIsNotValidKeepsItsDefaultAndTheOthersStay()
        {
            string path = Path.Combine(_dir, "settings.json");
            File.WriteAllText(path, """{ "ChordStyle": "Klingon", "TextSize": 7, "Paper": "Letter", "CheckForUpdates": "yes" }""");

            var settings = AppSettings.Load(path);

            Assert.Equal(ChordStyle.Letters, settings.ChordStyle);
            Assert.Equal(TextSize.Normal, settings.TextSize);
            Assert.True(settings.CheckForUpdates);
            Assert.Equal(PaperSize.Letter, settings.Paper);
        }

        [Theory]
        [InlineData("not json")]
        [InlineData("[1, 2]")]
        [InlineData("")]
        public void AnUnreadableFileGivesTheDefaults(string content)
        {
            string path = Path.Combine(_dir, "settings.json");
            File.WriteAllText(path, content);

            Assert.Equal(new AppSettings(), AppSettings.Load(path));
        }

        [Fact]
        public void FailingToWriteIsNotAnError()
        {
            // The path's folder is a file, so it can't be made.
            string blocker = Path.Combine(_dir, "blocker");
            File.WriteAllText(blocker, "");

            new AppSettings().Save(Path.Combine(blocker, "settings.json"));
        }

        [Fact]
        public void EachChangeInTheViewModelIsSavedAndAnnounced()
        {
            var saved = new List<AppSettings>();
            var changed = new List<string?>();
            var vm = new AppSettingsViewModel(new AppSettings(), saved.Add);
            vm.PropertyChanged += (_, e) => changed.Add(e.PropertyName);

            vm.TextSize = TextSize.Large;
            vm.TextSize = TextSize.Large;   // unchanged: nothing to save

            var only = Assert.Single(saved);
            Assert.Equal(TextSize.Large, only.TextSize);
            Assert.Contains(nameof(AppSettingsViewModel.TextSize), changed);
            Assert.Contains(nameof(AppSettingsViewModel.TextScale), changed);
            Assert.Equal(1.25, vm.TextScale);
        }

        [Theory]
        [InlineData(ChordStyle.Letters, "Am", false)]
        [InlineData(ChordStyle.Solfege, "Lam", true)]
        [InlineData(ChordStyle.Numerals, "vi", false)]
        public void TheChordExampleShowsWhatTheChoiceDoes(ChordStyle style, string firstChord, bool solfege)
        {
            var vm = new AppSettingsViewModel(new AppSettings());
            var changed = new List<string?>();
            vm.PropertyChanged += (_, e) => changed.Add(e.PropertyName);

            vm.ChordStyle = style;

            Assert.StartsWith(firstChord, vm.ChordExample);
            Assert.Equal(solfege, vm.Naming == Music.NoteNaming.Solfege);
            if (style != ChordStyle.Letters)
                Assert.Contains(nameof(AppSettingsViewModel.ChordExample), changed);
        }
    }
}
