using SongCreator.Music;

namespace SongCreator.Tests
{
    public class ChordTests
    {
        [Theory]
        [InlineData("Am", "A", "m", null)]
        [InlineData("F#m7/C#", "F#", "m7", "C#")]
        [InlineData("Bbmaj7", "Bb", "maj7", null)]
        [InlineData("G7(b9)", "G", "7(b9)", null)]
        [InlineData("D/F#", "D", "", "F#")]
        [InlineData("Ebsus4/Bb", "Eb", "sus4", "Bb")]
        public void ParsesRootTypeAndBass(string text, string root, string quality, string? bass)
        {
            Assert.True(Chord.TryParse(text, out var chord));
            Assert.Equal(root, chord.Root.ToString());
            Assert.Equal(quality, chord.Quality);
            Assert.Equal(bass, chord.Bass?.ToString());
            Assert.Equal(text, chord.ToString());
        }

        [Theory]
        [InlineData("")]
        [InlineData("am")]
        [InlineData("H7")]
        [InlineData("N.C.")]
        [InlineData("Am-ish")]
        [InlineData("Every")]
        [InlineData("C/G/B")]
        public void RejectsWhatIsNotAChord(string text)
        {
            Assert.False(Chord.IsValid(text));
        }

        [Theory]
        [InlineData("E#", 5)]
        [InlineData("B#", 0)]
        [InlineData("Fb", 4)]
        [InlineData("Cb", 11)]
        [InlineData("Bb", 10)]
        public void RareSpellingsHaveTheRightPitch(string note, int pitchClass)
        {
            Assert.True(Chord.TryParse(note, out var chord));
            Assert.Equal(pitchClass, chord.Root.PitchClass);
        }
    }
}
