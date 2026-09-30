using System.IO;
using SongCreator.IO;

namespace SongCreator.Tests
{
    /// <summary>
    /// The sample songs seeded by scripts/seed-songs.ps1 must be valid song files.
    /// </summary>
    public class SampleSongsTests
    {
        public static TheoryData<string> SampleFiles()
        {
            var files = new TheoryData<string>();
            foreach (string path in Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "samples"), "*.txt"))
                files.Add(Path.GetFileName(path));
            return files;
        }

        [Fact]
        public void SamplesAreCopiedForTesting()
        {
            Assert.NotEmpty(SampleFiles());
        }

        [Theory]
        [MemberData(nameof(SampleFiles))]
        public void SampleIsAWellFormedSong(string fileName)
        {
            string text = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "samples", fileName));
            var song = SongTextReader.Parse(text);

            Assert.NotEmpty(song.Title);
            Assert.NotEmpty(song.Key);
            Assert.NotEmpty(song.Sections);
            Assert.All(song.Sections, section => Assert.NotEmpty(section.Lines));
            Assert.Contains(song.Sections.SelectMany(s => s.Lines), line => line.Chords.Count > 0 && line.Text.Length > 0);
            // Written back unchanged, i.e. the file is exactly in the app's own format.
            Assert.Equal(text, SongTextWriter.ToText(song));
        }
    }
}
