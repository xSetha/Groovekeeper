using System.IO;
using SongCreator.IO;
using SongCreator.Models;

namespace SongCreator.Tests
{
    public class ChordProTests
    {
        private static readonly string Sample = string.Join(Environment.NewLine,
            "{title: Amazing Grace}",
            "{artist: John Newton}",
            "{key: G}",
            "",
            "{start_of_verse: Verse 1}",
            "A[G]mazing grace, how [G7]sweet the [C]sound",
            "That saved a wretch like me",
            "{end_of_verse}",
            "",
            "{start_of_chorus: Chorus}",
            "[G]   [D]",
            "{end_of_chorus}",
            "",
            "{comment: Verse 1}",
            "",
            "{chorus: Chorus}",
            "");

        [Fact]
        public void ReadsHeaderDirectives()
        {
            var song = ChordProReader.Parse(Sample);
            Assert.Equal("Amazing Grace", song.Title);
            Assert.Equal("John Newton", song.Artist);
            Assert.Equal("G", song.Key);
        }

        [Fact]
        public void ReadsInlineChordsAtTheLetterTheyPrecede()
        {
            var line = ChordProReader.Parse(Sample).Sections[0].Lines[0];
            Assert.Equal("Amazing grace, how sweet the sound", line.Text);
            Assert.Equal(["G", "G7", "C"], line.Chords.Select(c => c.Name));
            Assert.Equal([1, 19, 29], line.Chords.Select(c => c.Position));
        }

        [Fact]
        public void ReadsEnvironmentsAndRepeats()
        {
            var song = ChordProReader.Parse(Sample);
            Assert.Equal(["Verse 1", "Chorus", "Verse 1", "Chorus"], song.Sections.Select(s => s.Name));
            Assert.Equal([false, false, true, true], song.Sections.Select(s => s.IsRepeat));

            var chordsOnly = Assert.Single(song.Sections[1].Lines);
            Assert.Equal("", chordsOnly.Text);
            Assert.Equal([0, 3], chordsOnly.Chords.Select(c => c.Position));
        }

        [Fact]
        public void RoundTripsThroughWriter()
        {
            Assert.Equal(Sample, ChordProWriter.ToText(ChordProReader.Parse(Sample)));
        }

        [Theory]
        [MemberData(nameof(SampleSongsTests.SampleFiles), MemberType = typeof(SampleSongsTests))]
        public void SampleSongsSurviveChordPro(string fileName)
        {
            string text = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "samples", fileName));
            var song = SongTextReader.Parse(text);
            var copy = ChordProReader.Parse(ChordProWriter.ToText(song));
            Assert.Equal(SongTextWriter.ToText(song), SongTextWriter.ToText(copy));
        }

        [Fact]
        public void ReadsShortDirectiveNamesAndSubtitleAsArtist()
        {
            var song = ChordProReader.Parse("{t:Song}\n{st:Someone}\n{soc}\n[C]la\n{eoc}\n{chorus}\n");
            Assert.Equal("Song", song.Title);
            Assert.Equal("Someone", song.Artist);
            Assert.Equal(["Chorus", "Chorus"], song.Sections.Select(s => s.Name));
            Assert.True(song.Sections[1].IsRepeat);
        }

        [Fact]
        public void CommentHeadingsAndParagraphsBecomeSections()
        {
            var song = ChordProReader.Parse("{c: Intro}\n[Am]   [E]\n\n[Am]First verse\nstill first\n\nSecond verse\n");
            Assert.Equal(["Intro", "Verse 1", "Verse 2"], song.Sections.Select(s => s.Name));
            Assert.Equal(["First verse", "still first"], song.Sections[1].Lines.Select(l => l.Text));
        }

        [Fact]
        public void CommentRightBeforeAnEnvironmentNamesIt()
        {
            var song = ChordProReader.Parse("{c: Refrain}\n{soc}\nla la\n{eoc}\n");
            Assert.Equal("Refrain", Assert.Single(song.Sections).Name);
        }

        [Fact]
        public void ReadsLabelAttributes()
        {
            var song = ChordProReader.Parse("{start_of_verse label=\"Verse 2\"}\nhi\n{end_of_verse}\n");
            Assert.Equal("Verse 2", Assert.Single(song.Sections).Name);
        }

        [Fact]
        public void SkipsCommentsAndUnknownDirectives()
        {
            var song = ChordProReader.Parse("# a comment\n{capo: 2}\n{tempo: 90}\n[G]Hello\n");
            Assert.Equal("Hello", Assert.Single(Assert.Single(song.Sections).Lines).Text);
        }

        [Fact]
        public void KeepsBracketsThatAreNotChordsInTheLyrics()
        {
            var line = ChordProReader.ParseLyric("[N.C.]Stop [G]go");
            Assert.Equal("[N.C.]Stop go", line.Text);
            Assert.Equal(11, Assert.Single(line.Chords).Position);
        }

        [Fact]
        public void PadsChordsPastTheEndOfTheLyric()
        {
            var line = new SongLine("Hi").WithChord(0, "C").WithChord(6, "G");
            Assert.Equal("[C]Hi    [G]", ChordProWriter.InlineChords(line));
        }

        [Fact]
        public void WritesSectionsInTheMatchingEnvironment()
        {
            var song = new Song();
            foreach (string name in new[] { "Intro", "Chorus", "Bridge" })
            {
                var section = new Section(name);
                section.Lines.Add(new SongLine("la"));
                song.Sections.Add(section);
            }
            song.Sections.Add(new Section("Intro", isRepeat: true));

            string text = ChordProWriter.ToText(song);
            Assert.Contains("{start_of_verse: Intro}", text);
            Assert.Contains("{start_of_chorus: Chorus}", text);
            Assert.Contains("{start_of_bridge: Bridge}", text);
            Assert.Contains("{comment: Intro}", text);
        }
    }
}
