using SongCreator.Music;

namespace SongCreator.Tests
{
    public class MusicKeysTests
    {
        [Theory]
        [InlineData("C", 1, "Db")]
        [InlineData("E", 1, "F")]
        [InlineData("Bb", 1, "B")]
        [InlineData("B", -1, "Bb")]
        [InlineData("A#", 0, "Bb")]
        [InlineData("F", 1, "F#")]
        [InlineData("Am", 1, "Bbm")]
        [InlineData("Dm", 1, "Ebm")]
        [InlineData("Em", -1, "Ebm")]
        [InlineData("G#m", 12, "G#m")]
        [InlineData("", 3, "")]
        public void TransposedKeysGetTheirUsualName(string key, int semitones, string expected)
        {
            Assert.Equal(expected, MusicKeys.Transpose(key, semitones));
        }

        [Theory]
        [InlineData("F", true)]
        [InlineData("Bb", true)]
        [InlineData("Dm", true)]
        [InlineData("Ebm", true)]
        [InlineData("G", false)]
        [InlineData("F#", false)]
        [InlineData("Am", false)]
        [InlineData("C#m", false)]
        [InlineData("", null)]
        [InlineData("E#", null)]
        public void KnowsWhichKeysUseFlats(string key, bool? expected)
        {
            Assert.Equal(expected, MusicKeys.UsesFlats(key));
        }
    }
}
