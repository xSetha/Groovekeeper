using SongCreator.Models;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class UndoHistoryTests
    {
        private readonly Song _song = new();
        private readonly SongDocumentViewModel _document;

        public UndoHistoryTests()
        {
            var verse = new Section("Verse");
            verse.Lines.Add(new SongLine("hello"));
            verse.Lines.Add(new SongLine("world"));
            _song.Sections.Add(verse);
            _document = new SongDocumentViewModel(_song);
        }

        private UndoHistory History => _document.History;
        private SongLine Line(int index) => _song.Sections[0].Lines[index];

        // Each call is one user action, as if the dispatcher ran the commit in between.
        private void Type(SongLine line, string text)
        {
            line.Text = text;
            History.Commit();
        }

        [Fact]
        public void TypingInOneLineIsOneStep()
        {
            Type(Line(0), "hello ");
            Type(Line(0), "hello t");
            Type(Line(0), "hello there");

            History.Undo();
            Assert.Equal("hello", Line(0).Text);
        }

        [Fact]
        public void TypingInAnotherLineIsAnotherStep()
        {
            Type(Line(0), "hello!");
            Type(Line(1), "world!");

            History.Undo();
            Assert.Equal(["hello!", "world"], _song.Sections[0].Lines.Select(l => l.Text));
        }

        [Fact]
        public void ChordsMovedByTypingUndoWithTheText()
        {
            Line(0).Chords.Add(new ChordPlacement(2, "G"));
            History.Commit();
            Line(0).ApplyTextChange(0, 0, 2);
            Type(Line(0), "  hello");

            History.Undo();
            Assert.Equal("hello", Line(0).Text);
            Assert.Equal(2, Line(0).Chords[0].Position);
        }

        [Fact]
        public void AnEditCommandIsItsOwnStepAfterTyping()
        {
            Line(0).Text = "hello!";   // not committed yet: the command must not swallow it
            _document.AddLineCommand.Execute(_song.Sections[0]);

            History.Undo();
            Assert.Equal(2, _song.Sections[0].Lines.Count);
            Assert.Equal("hello!", Line(0).Text);
            History.Undo();
            Assert.Equal("hello", Line(0).Text);
        }

        [Fact]
        public void TypingRightAfterACommandIsANewStep()
        {
            _document.SplitLine(Line(0), 2);
            Type(Line(1), "llo!");

            History.Undo();
            Assert.Equal(["he", "llo", "world"], _song.Sections[0].Lines.Select(l => l.Text));
        }

        [Fact]
        public void RedoReappliesAndANewEditClearsIt()
        {
            _song.Key = "G";
            Line(0).Chords.Add(new ChordPlacement(0, "G"));
            History.Commit();
            _document.TransposeUpCommand.Execute(null);

            History.Undo();
            Assert.Equal("G", Line(0).Chords[0].Name);
            History.Redo();
            Assert.Equal("Ab", Line(0).Chords[0].Name);

            History.Undo();
            Type(Line(0), "changed");
            History.Redo();
            Assert.Equal("G", Line(0).Chords[0].Name);
        }

        [Fact]
        public void UndoCoversTheTitleAndSections()
        {
            Type(Line(0), "x");   // a step to undo past
            _song.Title = "My song";
            History.Commit();
            _document.DeleteSectionCommand.Execute(_song.Sections[0]);

            History.Undo();
            History.Undo();
            Assert.Equal("", _song.Title);
            Assert.Equal("x", Line(0).Text);
        }

        [Fact]
        public void LinesRestoredByUndoAreStillTracked()
        {
            Type(Line(0), "one");
            History.Undo();
            Type(Line(0), "two");   // a new line object, restored from the history

            History.Undo();
            Assert.Equal("hello", Line(0).Text);
        }

        [Fact]
        public void UndoWithNothingToUndoChangesNothing()
        {
            History.Undo();
            History.Redo();
            Assert.Equal(["hello", "world"], _song.Sections[0].Lines.Select(l => l.Text));
        }
    }
}
