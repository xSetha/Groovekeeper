using SongCreator.Music;

namespace SongCreator.Tests
{
    public class ChordTransposerTests
    {
        [Theory]
        [InlineData("Dm", 2, "Em")]
        [InlineData("Bb", -1, "A")]
        [InlineData("F#m7/C#", 1, "Gm7/D")]
        [InlineData("Eb", 1, "E")]
        [InlineData("Eb", 2, "F")]
        [InlineData("Ab", 1, "A")]
        [InlineData("Db", -1, "C")]
        [InlineData("Gb", 1, "G")]
        [InlineData("Bb", 1, "B")]
        [InlineData("B", 1, "C")]
        [InlineData("C", -1, "B")]
        [InlineData("Asus4", 12, "Asus4")]
        [InlineData("Em", -13, "D#m")]
        public void Transposes(string chord, int semitones, string expected)
        {
            Assert.Equal(expected, ChordTransposer.Transpose(chord, semitones));
        }

        [Fact]
        public void KeepsFlats()
        {
            Assert.Equal("Db", ChordTransposer.Transpose("Eb", -2));
        }

        [Theory]
        [InlineData("")]
        [InlineData("N.C.")]
        [InlineData("x2")]
        public void LeavesNonChordsUnchanged(string text)
        {
            Assert.Equal(text, ChordTransposer.Transpose(text, 3));
        }
    }
}
