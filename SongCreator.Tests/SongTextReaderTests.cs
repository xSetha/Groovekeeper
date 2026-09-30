using SongCreator.IO;
using SongCreator.Models;

namespace SongCreator.Tests
{
    public class SongTextReaderTests
    {
        private static readonly string Sample = string.Join(Environment.NewLine,
            "Constantine",
            "Traditional",
            "",
            "Tuning: E A D G B E · Key: Dm",
            "",
            "[Intro]",
            "Dm  Gm  Dm  Dm",
            "",
            "[Verse 1]",
            "Dm           A        Dm",
            "Constantine, Constantine",
            "Every Day without chords",
            "");

        [Fact]
        public void ReadsHeader()
        {
            var song = SongTextReader.Parse(Sample);
            Assert.Equal("Constantine", song.Title);
            Assert.Equal("Traditional", song.Artist);
            Assert.Equal("E A D G B E", song.Tuning);
            Assert.Equal("Dm", song.Key);
        }

        [Fact]
        public void ReadsChordsAboveLyrics()
        {
            var song = SongTextReader.Parse(Sample);
            Assert.Equal(["Intro", "Verse 1"], song.Sections.Select(s => s.Name));

            var intro = Assert.Single(song.Sections[0].Lines);
            Assert.Equal("", intro.Text);
            Assert.Equal([0, 4, 8, 12], intro.Chords.Select(c => c.Position));

            var verse = song.Sections[1].Lines;
            Assert.Equal(2, verse.Count);
            Assert.Equal("Constantine, Constantine", verse[0].Text);
            Assert.Equal(["Dm", "A", "Dm"], verse[0].Chords.Select(c => c.Name));
            Assert.Equal([0, 13, 22], verse[0].Chords.Select(c => c.Position));
            Assert.Equal("Every Day without chords", verse[1].Text);
            Assert.Empty(verse[1].Chords);
        }

        [Fact]
        public void RoundTripsThroughWriter()
        {
            Assert.Equal(Sample, SongTextWriter.ToText(SongTextReader.Parse(Sample)));
        }

        [Theory]
        [InlineData("Am  F#m7/C#  Bbmaj7  Dsus4  Cadd9  G7(b9)", true)]
        [InlineData("Every Day", false)]
        [InlineData("A day in the life", false)]
        [InlineData("", false)]
        public void DetectsChordLines(string line, bool expected)
        {
            Assert.Equal(expected, SongTextReader.IsChordLine(line));
        }

        [Fact]
        public void TextWithoutHeadingsGoesIntoASection()
        {
            var song = SongTextReader.Parse("Title\nArtist\nfirst lyric\nsecond lyric");
            Assert.Equal("Title", song.Title);
            Assert.Equal(["first lyric", "second lyric"], Assert.Single(song.Sections).Lines.Select(l => l.Text));
        }
    }
}
