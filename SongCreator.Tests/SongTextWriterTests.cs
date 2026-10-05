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
        public void WritesEverySectionAndBlankLineSoTheSongReadsBackTheSame()
        {
            var song = Song.CreateTemplate();
            song.Title = "My Song";
            song.Key = "Am";
            song.Sections[1].Lines[0].Text = "Hello there";
            song.Sections[1].Lines[0].Chords.Add(new ChordPlacement(6, "Am"));
            song.Sections[2].Lines.Add(new SongLine().WithChord(0, "C").WithChord(4, "G"));

            string[] expected =
            [
                "My Song", "", "Key: Am", "",
                "[Intro]", "", "",
                "[Verse 1]", "      Am", "Hello there", "",
                "[Chorus]", "", "C   G", "",
                "[Verse 2]", "", "",
                "[Bridge]", "", "",
                "[Outro]", "", "",
            ];
            string text = SongTextWriter.ToText(song);
            Assert.Equal(expected, text.Split(Environment.NewLine));

            var reread = SongTextReader.Parse(text);
            Assert.Equal(["Intro", "Verse 1", "Chorus", "Verse 2", "Bridge", "Outro"], reread.Sections.Select(s => s.Name));
            Assert.Equal([1, 1, 2, 1, 1, 1], reread.Sections.Select(s => s.Lines.Count));
            Assert.Equal(text, SongTextWriter.ToText(reread));
        }

        [Fact]
        public void WritesARepeatAsAMarkerUnderItsHeading()
        {
            var song = new Song();
            song.Sections.Add(new Section("Chorus", isRepeat: true));
            Assert.Equal($"[Chorus]{Environment.NewLine}(Repeat){Environment.NewLine}", SongTextWriter.ToText(song));
        }

        [Fact]
        public void ChordLineCanWriteChordsDifferently()
        {
            var line = new SongLine("Amazing grace").WithChord(0, "G").WithChord(8, "C");
            Assert.Equal("I       IV", SongTextWriter.ChordLine(line, name => Music.RomanNumerals.Of(name, "G")!));
        }
    }
}
