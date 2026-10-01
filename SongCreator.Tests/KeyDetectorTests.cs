using System.IO;
using SongCreator.IO;
using SongCreator.Music;

namespace SongCreator.Tests
{
    public class KeyDetectorTests
    {
        [Theory]
        [InlineData("G C D G", "G")]
        [InlineData("Am F C G Am", "Am")]
        [InlineData("C Am F G", "C")]                 // same chords as A minor, but starts on C
        [InlineData("Bb Eb F7 Bb", "Bb")]
        [InlineData("Am E7 Am", "Am")]               // the major V belongs to the minor key
        public void FindsTheKey(string chords, string key)
        {
            Assert.Equal(key, KeyDetector.Detect(chords.Split(' ')));
        }

        [Fact]
        public void NoChordsMeansNoKey()
        {
            Assert.Null(KeyDetector.Detect([]));
            Assert.Null(KeyDetector.Detect(["hello"]));
        }

        [Fact]
        public void ChordsFromAllOverMeanNoKey()
        {
            Assert.Null(KeyDetector.Detect(["C", "F#", "Bb", "E", "Ab", "D"]));
        }

        [Theory]
        [MemberData(nameof(SampleSongsTests.SampleFiles), MemberType = typeof(SampleSongsTests))]
        public void FindsTheKeyOfEverySample(string fileName)
        {
            var song = SongFile.Load(Path.Combine(AppContext.BaseDirectory, "samples", fileName));
            var chords = song.Sections.SelectMany(s => s.Lines).SelectMany(l => l.Chords.OrderBy(c => c.Position)).Select(c => c.Name).ToList();
            Assert.Equal(song.Key, KeyDetector.Detect(chords));
        }
    }
}
