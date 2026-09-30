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
    }
}
