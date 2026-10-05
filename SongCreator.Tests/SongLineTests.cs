using SongCreator.Models;

namespace SongCreator.Tests
{
    public class SongLineTests
    {
        private static int[] Positions(SongLine line) => line.Chords.Select(c => c.Position).ToArray();

        [Fact]
        public void InsertBeforeChordShiftsIt()
        {
            var line = new SongLine("hello world").WithChord(0, "C").WithChord(6, "G");
            line.ApplyTextChange(3, 0, 2);
            Assert.Equal([0, 8], Positions(line));
        }

        [Fact]
        public void InsertAtChordPositionKeepsChordOnItsLetter()
        {
            var line = new SongLine("hello world").WithChord(6, "G");
            line.ApplyTextChange(6, 0, 1);
            Assert.Equal([7], Positions(line));
        }

        [Fact]
        public void DeleteBeforeChordShiftsItBack()
        {
            var line = new SongLine("hello world").WithChord(6, "G");
            line.ApplyTextChange(0, 2, 0);
            Assert.Equal([4], Positions(line));
        }

        [Fact]
        public void DeletingChordLetterMovesChordToDeletionPoint()
        {
            var line = new SongLine("hello world").WithChord(7, "G");
            line.ApplyTextChange(5, 4, 0);
            Assert.Equal([5], Positions(line));
        }

        [Fact]
        public void ChordsPastTheTextKeepTheirColumn()
        {
            var line = new SongLine("").WithChord(0, "Dm").WithChord(4, "Gm");
            line.ApplyTextChange(0, 0, 3);
            Assert.Equal([0, 4], Positions(line));
        }

        [Fact]
        public void SplitMovesTailTextAndChords()
        {
            var line = new SongLine("hello world").WithChord(0, "C").WithChord(6, "G");
            var tail = line.SplitAt(6);
            Assert.Equal("hello ", line.Text);
            Assert.Equal([0], Positions(line));
            Assert.Equal("world", tail.Text);
            Assert.Equal([0], Positions(tail));
            Assert.Equal("G", tail.Chords[0].Name);
        }

        [Fact]
        public void AppendShiftsChordsOfNextLine()
        {
            var line = new SongLine("hello ").WithChord(0, "C");
            line.Append(new SongLine("world").WithChord(0, "G"));
            Assert.Equal("hello world", line.Text);
            Assert.Equal([0, 6], Positions(line));
        }

        private static (int, string)[] ChordsOf(SongLine line) => line.Chords.Select(c => (c.Position, c.Name)).ToArray();

        [Fact]
        public void SetChordPlacesATypedChord()
        {
            var line = new SongLine("hello world").WithChord(0, "G");
            Assert.True(line.SetChord(6, " Am7 "));
            Assert.Equal([(0, "G"), (6, "Am7")], ChordsOf(line));
        }

        [Fact]
        public void SetChordRenamesTheChordAlreadyThere()
        {
            var line = new SongLine("hello").WithChord(0, "G");
            var chord = line.Chords[0];
            Assert.True(line.SetChord(0, "D/F#"));
            Assert.Same(chord, Assert.Single(line.Chords));
            Assert.Equal("D/F#", chord.Name);
        }

        [Fact]
        public void SetChordWithAnEmptyNameRemovesTheChord()
        {
            var line = new SongLine("hello").WithChord(0, "G").WithChord(3, "C");
            Assert.True(line.SetChord(0, "  "));
            Assert.Equal([(3, "C")], ChordsOf(line));
            Assert.True(line.SetChord(1, ""));   // nothing there: nothing to do
            Assert.Equal([(3, "C")], ChordsOf(line));
        }

        [Theory]
        [InlineData("x2")]
        [InlineData("N.C.")]
        [InlineData("C6/9")]
        [InlineData("am")]
        public void SetChordRefusesWhatIsntAChord(string name)
        {
            var line = new SongLine("hello").WithChord(0, "G");
            Assert.False(line.SetChord(0, name));
            Assert.False(line.SetChord(2, name));
            Assert.Equal([(0, "G")], ChordsOf(line));
        }
    }
}
