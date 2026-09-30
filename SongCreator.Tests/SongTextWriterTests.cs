using SongCreator.IO;
using SongCreator.Models;

namespace SongCreator.Tests
{
    public class SongTextWriterTests
    {
        [Fact]
        public void ChordsSitAtTheirColumns()
        {
            var line = new SongLine("Constantine, Constantine").WithChord(0, "Dm").WithChord(13, "A").WithChord(22, "Dm");
            Assert.Equal("Dm           A        Dm", SongTextWriter.ChordLine(line));
        }

        [Fact]
        public void OverlappingChordIsPushedRight()
        {
            var line = new SongLine("abc").WithChord(1, "F#m7").WithChord(0, "C").WithChord(2, "G");
            Assert.Equal("C F#m7 G", SongTextWriter.ChordLine(line));
        }

        [Fact]
        public void WritesHeaderAndSkipsEmptySections()
        {
            var song = Song.CreateTemplate();
            song.Title = "My Song";
            song.Key = "Am";
            song.Sections[1].Lines[0].Text = "Hello there";
            song.Sections[1].Lines[0].Chords.Add(new ChordPlacement(6, "Am"));
            song.Sections[2].Lines.Add(new SongLine().WithChord(0, "C").WithChord(4, "G"));

            string[] expected =
            [
                "My Song",
                "",
                "Key: Am",
                "",
                "[Verse 1]",
                "      Am",
                "Hello there",
                "",
                "[Chorus]",
                "C   G",
                "",
            ];
            Assert.Equal(expected, SongTextWriter.ToText(song).Split(Environment.NewLine));
        }
    }
}
