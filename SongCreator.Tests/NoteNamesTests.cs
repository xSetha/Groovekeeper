using SongCreator.Music;

namespace SongCreator.Tests
{
    /// <summary>What the shared solfege.json fixture doesn't cover: how typed text is taken.</summary>
    public class NoteNamesTests
    {
        [Theory]
        [InlineData("Am7", "Am7")]      // letters stay as typed
        [InlineData(" Am7 ", "Am7")]
        [InlineData("lam7", "Am7")]     // Do Re Mi become letters
        [InlineData("Sib/Re", "Bb/D")]
        [InlineData("Domino", null)]    // neither
        [InlineData("", null)]
        public void NormalizeKeepsLettersAndTurnsSolfegeIntoLetters(string typed, string? expected)
        {
            Assert.Equal(expected, NoteNames.Normalize(typed));
        }

        [Theory]
        [InlineData("Am", NoteNaming.Letters, "Am")]
        [InlineData("Am", NoteNaming.Solfege, "Lam")]
        [InlineData("N.C.", NoteNaming.Solfege, "N.C.")]
        public void DisplayWritesTheChordInTheChosenNaming(string chord, NoteNaming naming, string expected)
        {
            Assert.Equal(expected, NoteNames.Display(chord, naming));
        }

        [Theory]
        [InlineData("C")]
        [InlineData("F#m7")]
        [InlineData("Bbmaj7/D")]
        [InlineData("G/B")]
        public void TypingWhatWasShownGivesTheSameChord(string chord)
        {
            Assert.Equal(chord, NoteNames.FromSolfege(NoteNames.ToSolfege(chord)));
        }
    }
}
