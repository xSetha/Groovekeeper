using System.Text;
using System.Text.RegularExpressions;
using SongCreator.IO;

namespace SongCreator.Tests
{
    public class SongPdfWriterTests
    {
        private const string Constantine =
            "Constantine\r\nTraditional\r\n\r\nKey: Dm\r\n\r\n[Intro]\r\nDm  Gm  Dm  Dm\r\n\r\n" +
            "[Verse 1]\r\nDm           A        Dm\r\nConstantine, Constantine\r\nDm        A        Dm\r\nMă mir şi mă uit la tine\r\n";

        [Theory]
        [InlineData(true)]
        [InlineData(false)]
        public void CreatesAPdf(bool tableOfContents)
        {
            var songs = Enumerable.Range(0, 3).Select(_ => SongTextReader.Parse(Constantine)).ToList();

            byte[] pdf = SongPdfWriter.Create(songs, tableOfContents);

            Assert.Equal("%PDF", Encoding.ASCII.GetString(pdf, 0, 4));
        }

        [Fact]
        public void LongSongsFlowOntoMorePages()
        {
            var song = SongTextReader.Parse(Constantine);
            for (int i = 0; i < 200; i++)
                song.Sections[1].Lines.Add(new Models.SongLine($"line {i}").WithChord(0, "Am"));

            byte[] pdf = SongPdfWriter.Create([song], tableOfContents: false);

            // Count page objects ("/Type /Page", not "/Type /Pages").
            int pages = Regex.Matches(Encoding.ASCII.GetString(pdf), @"/Type\s*/Page\b").Count;
            Assert.True(pages >= 3, $"expected several pages, got {pages}");
        }

        private const string RepeatingSong =
            "Song\n\n[Chorus]\nG       C\nI gotta feeling\n\n[Verse]\nAm\nla la\n\n" +
            "[chorus]\nG       C\nI gotta feeling   \n\n\n" +                // same, apart from case and blank space
            "[Chorus]\nG       D\nI gotta feeling\n\n" +                     // another chord
            "[Chorus 2]\nG       C\nI gotta feeling\n";                        // another name

        [Fact]
        public void FindsSectionsThatRepeatAnEarlierOneExactly()
        {
            var song = SongTextReader.Parse(RepeatingSong);
            Assert.Equal([song.Sections[2]], SongPdfWriter.RepeatedSections(song));
        }

        [Fact]
        public void RepeatMarkersAndEmptySectionsAreNotRepeatedSections()
        {
            var song = SongTextReader.Parse("Song\n\n[Chorus]\nG\nla\n\n[Chorus]\n(Repeat)\n\n[Bridge]\n\n[Bridge]\n");
            Assert.True(song.Sections[1].IsRepeat);
            Assert.Empty(SongPdfWriter.RepeatedSections(song));
        }

        [Fact]
        public void CreatesAPdfWithRepeatsCollapsed()
        {
            byte[] pdf = SongPdfWriter.Create([SongTextReader.Parse(RepeatingSong)], tableOfContents: false, collapseRepeats: true);
            Assert.Equal("%PDF", Encoding.ASCII.GetString(pdf, 0, 4));
        }
    }
}
