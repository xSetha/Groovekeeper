using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class WebImportViewModelTests
    {
        // As copied from a chord site: headings, chords over lyrics, non-breaking spaces between chords.
        private static readonly string Sheet = string.Join("\n",
            "[Verse 1]",
            " G                 G7        C",
            "Amazing grace, how sweet the sound",
            "",
            "[Chorus]",
            "D    G",
            "la la");

        [Fact]
        public void TurnsAChordSheetIntoSectionsAndChords()
        {
            var import = new WebImportViewModel();

            Assert.True(import.Import(Sheet, "AMAZING GRACE CHORDS by John Newton @ Ultimate-Guitar.Com"));

            var song = import.ImportedSong!;
            Assert.Equal("Amazing Grace", song.Title);
            Assert.Equal("John Newton", song.Artist);
            Assert.Equal(["Verse 1", "Chorus"], song.Sections.Select(s => s.Name));
            var line = Assert.Single(song.Sections[0].Lines);
            Assert.Equal("Amazing grace, how sweet the sound", line.Text);
            Assert.Equal(["G", "G7", "C"], line.Chords.Select(c => c.Name));
            Assert.Equal([1, 19, 29], line.Chords.Select(c => c.Position));
            Assert.Equal([0, 5], song.Sections[1].Lines[0].Chords.Select(c => c.Position));
            Assert.Null(import.Error);
        }

        [Fact]
        public void TextWithoutHeadingsGoesIntoAVerse()
        {
            var import = new WebImportViewModel();
            Assert.True(import.Import("C       G\nTwinkle twinkle", "Twinkle"));
            Assert.Equal("Verse 1", Assert.Single(import.ImportedSong!.Sections).Name);
        }

        [Fact]
        public void RejectsTextWithoutChords()
        {
            var import = new WebImportViewModel();

            Assert.False(import.Import("Just some lyrics\nand nothing else", "Some page"));

            Assert.Null(import.ImportedSong);
            Assert.StartsWith("No chords found", import.Error);
        }

        [Theory]
        [InlineData("AMAZING GRACE CHORDS by John Newton @ Ultimate-Guitar.Com", "Amazing Grace", "John Newton")]
        [InlineData("Wonderwall Chords by Oasis | E-Chords", "Wonderwall", "Oasis")]
        [InlineData("Scarborough Fair (Lyrics and Chords) - Some Site", "Scarborough Fair", "")]
        [InlineData("Oh Susanna Chords and Lyrics", "Oh Susanna", "")]
        [InlineData("Chords", "Chords", "")]
        [InlineData("Auld Lang Syne", "Auld Lang Syne", "")]
        [InlineData("", "", "")]
        public void GuessesTitleAndArtistFromThePageTitle(string pageTitle, string title, string artist)
        {
            Assert.Equal((title, artist), WebImportViewModel.GuessTitle(pageTitle));
        }

        [Fact]
        public void SearchesForTheSongsChords()
        {
            Assert.Equal("https://duckduckgo.com/?q=Amazing%20Grace%20chords", WebImportViewModel.SearchUrl(" Amazing Grace "));
        }
    }
}
