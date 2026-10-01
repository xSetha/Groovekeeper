using System.IO;
using SongCreator.IO;

namespace SongCreator.Tests
{
    public class WindowSettingsTests : IDisposable
    {
        private readonly string _dir = Directory.CreateTempSubdirectory("SongCreatorTests").FullName;

        public void Dispose() => Directory.Delete(_dir, recursive: true);

        [Fact]
        public void RemembersSizeAndLibraryPanel()
        {
            string path = Path.Combine(_dir, "settings", "window.json");
            new WindowSettings(1400, 950, IsLibraryPanelOpen: false).Save(path);

            Assert.Equal(new WindowSettings(1400, 950, false), WindowSettings.Load(path));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("not json")]
        [InlineData("""{ "Width": 0, "Height": 0, "IsLibraryPanelOpen": false }""")]
        public void FallsBackToTheDefaults(string? content)
        {
            string path = Path.Combine(_dir, "window.json");
            if (content != null)
                File.WriteAllText(path, content);

            Assert.Equal(WindowSettings.Default, WindowSettings.Load(path));
        }
    }
}
