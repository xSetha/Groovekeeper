using SongCreator.Music;

namespace SongCreator.Tests
{
    public class ChordTheoryTests
    {
        [Theory]
        [InlineData("G", "G Am Bm C D Em F#dim D7")]
        [InlineData("C", "C Dm Em F G Am Bdim G7")]
        [InlineData("F", "F Gm Am Bb C Dm Edim C7")]
        [InlineData("Bb", "Bb Cm Dm Eb F Gm Adim F7")]
        [InlineData("Am", "Am Bdim C Dm Em F G E7")]
        [InlineData("Dm", "Dm Edim F Gm Am Bb C A7")]
        [InlineData("F#m", "F#m G#dim A Bm C#m D E C#7")]
        public void ListsTheChordsOfAKey(string key, string expected)
        {
            Assert.Equal(expected.Split(' '), ChordTheory.DiatonicChords(key));
        }

        [Theory]
        [InlineData("")]
        [InlineData("H")]
        [InlineData("Cb")]
        [InlineData("Gsus4")]
        public void UnknownKeyHasNoChords(string key)
        {
            Assert.Empty(ChordTheory.DiatonicChords(key));
        }

        [Theory]
        [InlineData("Am", "A")]
        [InlineData("A#m", "Bb")]
        [InlineData("Db", "C#")]
        [InlineData("", null)]
        public void RootOfUsesThePaletteSpelling(string key, string? expected)
        {
            Assert.Equal(expected, ChordTheory.RootOf(key));
        }

        [Theory]
        [InlineData("Am7", "G", true)]
        [InlineData("F#dim", "G", true)]
        [InlineData("F", "G", false)]
        [InlineData("Bm", "G", true)]
        [InlineData("B", "G", false)]               // the scale has Bm, not B
        [InlineData("E7", "Am", true)]              // the major V of a minor key
        [InlineData("Am", "", false)]
        public void ChordsFitTheKeyByRootAndTriad(string chord, string key, bool fits)
        {
            Assert.Equal(fits, ChordTheory.FitsKey(chord, key));
        }

        [Fact]
        public void SuggestsWhatUsuallyComesNext()
        {
            Assert.Equal(["C", "D", "Em", "Am"], ChordTheory.SuggestNext("G", "G"));
            Assert.Equal(["G", "Em", "C"], ChordTheory.SuggestNext("D7", "G"));
            Assert.Equal(["Am", "F"], ChordTheory.SuggestNext("E", "Am"));
            Assert.Empty(ChordTheory.SuggestNext("F", "G"));
        }
    }
}
