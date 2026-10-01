using SongCreator.Music;

namespace SongCreator.Tests
{
    public class RomanNumeralsTests
    {
        [Theory]
        [InlineData("G", "G", "I")]
        [InlineData("Am7", "G", "ii7")]
        [InlineData("D7", "G", "V7")]
        [InlineData("Cmaj7", "G", "IVmaj7")]
        [InlineData("F#dim", "G", "vii°")]
        [InlineData("F#m7b5", "G", "viiø7")]
        [InlineData("F", "G", "bVII")]
        [InlineData("G/B", "G", "I/3")]
        [InlineData("Dsus4", "G", "Vsus4")]
        [InlineData("Caug", "C", "I+")]
        [InlineData("Am", "Am", "i")]
        [InlineData("C", "Am", "bIII")]
        [InlineData("E7", "Am", "V7")]
        [InlineData("Bdim7", "Am", "ii°7")]
        [InlineData("Db", "C#", "I")]                 // spelling doesn't matter, only the pitch
        public void WritesTheNumeral(string chord, string key, string numeral)
        {
            Assert.Equal(numeral, RomanNumerals.Of(chord, key));
        }

        [Theory]
        [InlineData("G", "")]
        [InlineData("hello", "G")]
        public void NeedsAChordAndAKey(string chord, string key)
        {
            Assert.Null(RomanNumerals.Of(chord, key));
        }
    }
}
