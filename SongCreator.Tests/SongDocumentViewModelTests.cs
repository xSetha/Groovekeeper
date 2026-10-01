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

        [Fact]
        public void SectionsMoveUpAndDownWithinTheSong()
        {
            var intro = AddSection("Intro", "a");
            var verse = AddSection("Verse", "b");

            _document.MoveSectionUpCommand.Execute(verse);
            Assert.Equal([verse, intro], _song.Sections);
            _document.MoveSectionUpCommand.Execute(verse);
            _document.MoveSectionDownCommand.Execute(intro);
            Assert.Equal([verse, intro], _song.Sections);
        }

        [Fact]
        public void DuplicateInsertsAnIndependentCopyBelow()
        {
            var chorus = AddSection("Chorus", "la la");
            chorus.Lines[0].Chords.Add(new ChordPlacement(0, "G"));
            AddSection("Verse", "b");

            _document.DuplicateSectionCommand.Execute(chorus);
            var copy = _song.Sections[1];
            copy.Lines[0].Chords[0].Name = "D";

            Assert.Equal(["Chorus", "Chorus", "Verse"], _song.Sections.Select(s => s.Name));
            Assert.Equal("la la", copy.Lines[0].Text);
            Assert.Equal("G", chorus.Lines[0].Chords[0].Name);
        }

        [Fact]
        public void RepeatAddsAMarkerAtTheEnd()
        {
            var chorus = AddSection("Chorus", "la la");
            AddSection("Verse", "b");

            _document.RepeatSectionCommand.Execute(chorus);

            var repeat = _song.Sections[2];
            Assert.Equal("Chorus", repeat.Name);
            Assert.True(repeat.IsRepeat);
            Assert.Empty(repeat.Lines);
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

        [Fact]
        public void NumeralsFollowTheToggleAndTheKey()
        {
            _song.Key = "G";
            var changed = new List<string?>();
            _document.PropertyChanged += (_, e) => changed.Add(e.PropertyName);

            Assert.Equal("", _document.NumeralKey);
            _document.ShowNumerals = true;
            Assert.Equal("G", _document.NumeralKey);
            _song.Key = "A";
            Assert.Equal("A", _document.NumeralKey);
            Assert.Equal(2, changed.Count(name => name == nameof(SongDocumentViewModel.NumeralKey)));
        }

        [Fact]
        public void PastingChordsOverLyricsPlacesTheChords()
        {
            var blank = AddSection("Verse 1", "");
            _document.PasteLines(blank.Lines[0], 0,
                "[Verse 1]\r\n G\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0C\r\nAmazing grace\r\n\r\n[Chorus]\r\nAm  F\r\n\r\nla la");

            var verse = Assert.Single(_song.Sections[0].Lines);
            Assert.Equal("Amazing grace", verse.Text);
            Assert.Equal([(1, "G"), (8, "C")], verse.Chords.Select(c => (c.Position, c.Name)));

            // A chord row followed by a blank row stays a chord-only line.
            Assert.Equal(["", "la la"], _song.Sections[1].Lines.Select(l => l.Text));
            Assert.Equal(["Am", "F"], _song.Sections[1].Lines[0].Chords.Select(c => c.Name));
        }

        [Fact]
        public void PastedChordsStartingABlankLineGoIntoIt()
        {
            var verse = AddSection("Verse", "");
            _document.PasteLines(verse.Lines[0], 0, "D    G\nhello there\nworld");

            Assert.Equal(["hello there", "world"], verse.Lines.Select(l => l.Text));
            Assert.Equal(["D", "G"], verse.Lines[0].Chords.Select(c => c.Name));
            Assert.Empty(verse.Lines[1].Chords);
        }

        [Fact]
        public void PastedChordsAfterTextStartANewLine()
        {
            var verse = AddSection("Verse", "keep me");
            _document.PasteLines(verse.Lines[0], 7, "\nEm\nla");

            Assert.Equal(["keep me", "la"], verse.Lines.Select(l => l.Text));
            Assert.Equal("Em", Assert.Single(verse.Lines[1].Chords).Name);
        }

        [Fact]
        public void TheKeyBoxShowsNothingForASongWithoutAKey()
        {
            Assert.Null(_document.KeyChoice);
            _song.Key = "H";                                       // not a key the box offers
            Assert.Null(_document.KeyChoice);
        }

        [Fact]
        public void TheKeyBoxFollowsAndSetsTheSongKey()
        {
            var changed = new List<string?>();
            _document.PropertyChanged += (_, e) => changed.Add(e.PropertyName);

            _song.Key = "G";
            Assert.Equal("G", _document.KeyChoice);
            Assert.Contains(nameof(SongDocumentViewModel.KeyChoice), changed);

            _document.KeyChoice = "Em";
            Assert.Equal("Em", _song.Key);
        }

        [Fact]
        public void AClearedKeyBoxLeavesTheKeyAlone()
        {
            _song.Key = "G";
            _document.KeyChoice = null;
            Assert.Equal("G", _song.Key);
        }
    }
}
