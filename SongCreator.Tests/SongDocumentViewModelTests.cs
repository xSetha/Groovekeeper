using SongCreator.Models;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class SongDocumentViewModelTests
    {
        private readonly Song _song = new();
        private readonly SongDocumentViewModel _document;
        private FocusRequest? _focus;

        public SongDocumentViewModelTests()
        {
            _document = new SongDocumentViewModel(_song);
            _document.FocusRequested += (_, request) => _focus = request;
        }

        private Section AddSection(string name, params string[] lines)
        {
            var section = new Section(name);
            foreach (string line in lines)
                section.Lines.Add(new SongLine(line));
            _song.Sections.Add(section);
            return section;
        }

        [Fact]
        public void SplitInsertsTheTailBelowAndFocusesIt()
        {
            var verse = AddSection("Verse", "hello world");
            _document.SplitLine(verse.Lines[0], 6);

            Assert.Equal(["hello ", "world"], verse.Lines.Select(l => l.Text));
            Assert.Equal(new FocusRequest(verse.Lines[1], 0), _focus);
        }

        [Fact]
        public void MergeJoinsOntoThePreviousLine()
        {
            var verse = AddSection("Verse", "hello ", "world");
            _document.MergeWithPrevious(verse.Lines[1]);

            Assert.Equal("hello world", Assert.Single(verse.Lines).Text);
            Assert.Equal(new FocusRequest(verse.Lines[0], 6), _focus);
        }

        [Fact]
        public void MergeRemovesAnEmptyFirstLine()
        {
            var verse = AddSection("Verse", "", "second");
            _document.MergeWithPrevious(verse.Lines[0]);
            Assert.Equal("second", Assert.Single(verse.Lines).Text);
        }

        [Fact]
        public void MoveFocusCrossesSections()
        {
            var intro = AddSection("Intro", "a");
            var verse = AddSection("Verse", "b");
            _document.MoveFocus(intro.Lines[0], 1, 3);
            Assert.Equal(new FocusRequest(verse.Lines[0], 3), _focus);
        }

        [Fact]
        public void PastingASongIntoABlankLineBuildsSections()
        {
            var blank = AddSection("Verse 1", "");
            _document.PasteLines(blank.Lines[0], 0, "[Verse]\r\nfirst line\r\nsecond line\r\n\r\n[Chorus]\r\nla la la");

            Assert.Equal(["Verse", "Chorus"], _song.Sections.Select(s => s.Name));
            Assert.Equal(["first line", "second line"], _song.Sections[0].Lines.Select(l => l.Text));
            Assert.Equal(["la la la"], _song.Sections[1].Lines.Select(l => l.Text));
            Assert.Equal(new FocusRequest(_song.Sections[1].Lines[0], 8), _focus);
        }

        [Fact]
        public void PastingMidLineKeepsTheTailAfterThePastedLines()
        {
            var verse = AddSection("Verse", "startend");
            _document.PasteLines(verse.Lines[0], 5, "one\ntwo");
            Assert.Equal(["startone", "two", "end"], verse.Lines.Select(l => l.Text));
        }

        [Theory]
        [MemberData(nameof(AllKeys))]
        public void TransposingKeepsTheKeyInTheKeyDropdown(string key)
        {
            _song.Key = key;
            _document.TransposeUpCommand.Execute(null);
            Assert.Contains(_song.Key, Music.MusicKeys.All);
            _document.TransposeDownCommand.Execute(null);
            _document.TransposeDownCommand.Execute(null);
            Assert.Contains(_song.Key, Music.MusicKeys.All);
        }

        public static TheoryData<string> AllKeys() => new(Music.MusicKeys.All);

        [Fact]
        public void TransposeUpdatesTheKeyAndChords()
        {
            _song.Key = "G";
            AddSection("Verse", "x").Lines[0].Chords.Add(new ChordPlacement(0, "Em"));

            _document.TransposeUpCommand.Execute(null);
            _document.TransposeUpCommand.Execute(null);

            Assert.Equal("A", _song.Key);
            Assert.Equal("F#m", _song.Sections[0].Lines[0].Chords[0].Name);
        }

        [Fact]
        public void CommandsEditTheSong()
        {
            var verse = AddSection("Verse", "x");
            verse.Lines[0].Chords.Add(new ChordPlacement(0, "Am"));

            _document.TransposeUpCommand.Execute(null);
            _document.AddLineCommand.Execute(verse);
            _document.AddSectionCommand.Execute(null);
            _document.DeleteSectionCommand.Execute(verse);

            Assert.Equal("A#m", verse.Lines[0].Chords[0].Name);
            Assert.Equal(2, verse.Lines.Count);
            Assert.Equal("New Section", Assert.Single(_song.Sections).Name);
        }
    }
}
