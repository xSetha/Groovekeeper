using SongCreator.Models;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class FindReplaceViewModelTests
    {
        private readonly Song _song = new();
        private readonly SongDocumentViewModel _document;
        private readonly List<FindMatch> _matches = new();

        public FindReplaceViewModelTests()
        {
            var verse = new Section("Verse");
            verse.Lines.Add(new SongLine("Love me do, you know I love you").WithChord(0, "G").WithChord(12, "C"));
            verse.Lines.Add(new SongLine("so please, love me do").WithChord(0, "Gm"));
            _song.Sections.Add(verse);
            _document = new SongDocumentViewModel(_song);
            Find.MatchFound += (_, match) => _matches.Add(match);
        }

        private FindReplaceViewModel Find => _document.Find;
        private SongLine Line(int index) => _song.Sections[0].Lines[index];

        [Fact]
        public void ChordsAreFoundAndReplacedByTheirDoReMiNamesToo()
        {
            Find.SearchChords = true;
            Find.FindText = "Sol";
            Find.ReplaceText = "Fa#m";

            Assert.Equal("1 match", Find.Summary);
            Find.ReplaceAll();

            Assert.Equal("F#m", Line(0).Chords[0].Name);
            Assert.Equal("C", Line(0).Chords[1].Name);
        }

        [Fact]
        public void CountsLyricMatchesIgnoringCase()
        {
            Find.FindText = "love";
            Assert.Equal("3 matches", Find.Summary);
        }

        [Fact]
        public void ChordsMatchByExactName()
        {
            Find.SearchChords = true;
            Find.FindText = "G";
            Assert.Equal("1 match", Find.Summary);
        }

        [Fact]
        public void FindNextWalksTheMatchesAndWrapsAround()
        {
            Find.FindText = "love";
            for (int i = 0; i < 4; i++)
                Find.FindNext();

            Assert.Equal(
                [new FindMatch(Line(0), 0, 4), new FindMatch(Line(0), 23, 4), new FindMatch(Line(1), 11, 4), new FindMatch(Line(0), 0, 4)],
                _matches);
        }

        [Fact]
        public void HighlightsLyricsOnlyWhileTheBarIsOpenOnLyrics()
        {
            Find.FindText = "love";
            Assert.Equal("", Find.HighlightText);
            Find.IsOpen = true;
            Assert.Equal("love", Find.HighlightText);
            Find.SearchChords = true;
            Assert.Equal("", Find.HighlightText);
        }

        [Fact]
        public void ChangingTheSearchStartsOverFromTheTop()
        {
            Find.FindText = "love";
            Find.FindNext();
            Find.FindNext();
            Find.FindText = "me";

            Assert.Null(Find.CurrentMatch);
            Find.FindNext();
            Assert.Equal(new FindMatch(Line(0), 5, 2), Find.CurrentMatch);
        }

        [Fact]
        public void ReplacingLyricsKeepsChordsOverTheirWords()
        {
            Find.FindText = "love";
            Find.ReplaceText = "hug";
            Find.ReplaceAll();

            Assert.Equal("hug me do, you know I hug you", Line(0).Text);
            Assert.Equal("so please, hug me do", Line(1).Text);
            Assert.Equal(11, Line(0).Chords[1].Position);   // still over "you"
            Assert.Equal("No matches", Find.Summary);
        }

        [Fact]
        public void ReplacingChordsLeavesSimilarChordsAlone()
        {
            Find.SearchChords = true;
            Find.FindText = "G";
            Find.ReplaceText = "G7";
            Find.ReplaceAll();

            Assert.Equal(["G7", "C", "Gm"], _song.Sections[0].Lines.SelectMany(l => l.Chords).Select(c => c.Name));
        }

        [Fact]
        public void AChordIsOnlyReplacedWithAChord()
        {
            Find.SearchChords = true;
            Find.FindText = "C";
            Find.ReplaceText = "hello";
            Find.ReplaceAll();

            Assert.Equal("C", Line(0).Chords[1].Name);
            Assert.Equal("\"hello\" isn't a chord", Find.Summary);
        }

        [Fact]
        public void ReplaceAllIsOneUndoStep()
        {
            Find.FindText = "love";
            Find.ReplaceText = "hug";
            Find.ReplaceAll();

            _document.History.Undo();
            Assert.Equal("Love me do, you know I love you", Line(0).Text);
            Assert.Equal("so please, love me do", Line(1).Text);
        }
    }
}
