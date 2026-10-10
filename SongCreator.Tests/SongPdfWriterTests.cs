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

        [Theory]
        [InlineData(ChordStyle.Letters)]
        [InlineData(ChordStyle.Solfege)]
        [InlineData(ChordStyle.Numerals)]
        public void EveryChordStyleCreatesAPdf(ChordStyle style)
        {
            byte[] pdf = SongPdfWriter.Create([SongTextReader.Parse(Constantine)], tableOfContents: false, style);

            Assert.Equal("%PDF", Encoding.ASCII.GetString(pdf, 0, 4));
        }

        [Fact]
        public void ChordStylesWriteChordsAndTheKeyLine()
        {
            var song = SongTextReader.Parse(Constantine);

            Assert.Null(SongPdfWriter.ChordDisplay(song, ChordStyle.Letters));
            Assert.Equal("Rem", SongPdfWriter.ChordDisplay(song, ChordStyle.Solfege)!("Dm"));
            Assert.Equal("i", SongPdfWriter.ChordDisplay(song, ChordStyle.Numerals)!("Dm"));
            Assert.Equal("Dm", SongPdfWriter.KeyText(song, ChordStyle.Letters));
            Assert.Equal("Rem", SongPdfWriter.KeyText(song, ChordStyle.Solfege));
            Assert.Equal("Dm", SongPdfWriter.KeyText(song, ChordStyle.Numerals));
        }

        [Fact]
        public void RomanNumeralsNeedAKeyElseTheChordsStayLetters()
        {
            var song = SongTextReader.Parse("Song\n\n[Verse]\nG\nla la\n");

            Assert.Null(SongPdfWriter.ChordDisplay(song, ChordStyle.Numerals));
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

        // ---- Notes ----

        private static readonly HashSet<Models.Section> NoneCollapsed = [];

        [Fact]
        public void ANoteGoesWithTheLineUnderItAtItsColumn()
        {
            var song = SongTextReader.Parse("Song\n\n[Verse]\nG\none\ntwo\n\n[Chorus]\nthree\n");
            var lines = song.Sections.SelectMany(s => s.Lines).ToList();
            var onTwo = new Models.SongNote("on two", 10, 0, printRow: 1);
            var halfway = new Models.SongNote("halfway", 0, 0, printRow: 1.5);
            var above = new Models.SongNote("above", 2, 0, printRow: -1);
            var below = new Models.SongNote("below", 0, 0, printRow: 7.5);
            song.Notes.Add(onTwo);
            song.Notes.Add(halfway);
            song.Notes.Add(above);
            song.Notes.Add(below);

            var placed = SongPdfWriter.PlaceNotes(song, NoneCollapsed);

            Assert.Equal([onTwo, halfway], placed[lines[1]].Select(p => p.Note));
            var (x, y) = (placed[lines[1]][0].X, placed[lines[1]][0].Y);
            Assert.True(x > 50 && x < 60, $"column 10 is about ten Consolas letters in, got {x}");
            Assert.Equal(0, y);
            // Halfway towards the chorus' first line: half of this line plus the chorus heading.
            Assert.True(placed[lines[1]][1].Y > 15, $"got {placed[lines[1]][1].Y}");
            Assert.True(placed[lines[0]].Single().Y < 0);   // above the first line: drawn above it
            Assert.Equal(below, placed[lines[2]].Single().Note);   // below the last line: with the last line
        }

        [Fact]
        public void ANoteOverACollapsedRepeatGoesWithThePrintedLineBefore()
        {
            var song = SongTextReader.Parse("Song\n\n[Chorus]\nhey\n\n[Verse]\nla\n\n[Chorus]\nhey\n");
            var note = new Models.SongNote("x2", 0, 0, printRow: 2);
            song.Notes.Add(note);

            var placed = SongPdfWriter.PlaceNotes(song, SongPdfWriter.RepeatedSections(song));

            Assert.Equal(note, placed[song.Sections[1].Lines[0]].Single().Note);
        }

        [Fact]
        public void CreatesAPdfWithNotesAnywhere()
        {
            var song = SongTextReader.Parse(Constantine);
            song.Notes.Add(new Models.SongNote("build up here\nthen hold", 30, 0, printRow: 1.5));
            song.Notes.Add(new Models.SongNote("far out", 400, 0, printRow: 99));
            song.Notes.Add(new Models.SongNote("way up", 0, 0, printRow: -40));

            byte[] pdf = SongPdfWriter.Create([song], tableOfContents: true, collapseRepeats: true);

            Assert.Equal("%PDF", Encoding.ASCII.GetString(pdf, 0, 4));
        }

        [Fact]
        public void APageFitsAboutEightyLetters()
        {
            Assert.InRange(SongPdfWriter.PrintedColumns(PaperSize.A4), 80, 86);
        }

        [Fact]
        public void USLetterPaperIsWiderThanA4()
        {
            Assert.True(SongPdfWriter.PrintedColumns(PaperSize.Letter) > SongPdfWriter.PrintedColumns(PaperSize.A4));
        }

        [Theory]
        [InlineData(PaperSize.A4)]
        [InlineData(PaperSize.Letter)]
        public void EveryPaperSizeCreatesAPdf(PaperSize paper)
        {
            byte[] pdf = SongPdfWriter.Create([SongTextReader.Parse(Constantine)], tableOfContents: false, paper: paper);

            Assert.Equal("%PDF", Encoding.ASCII.GetString(pdf, 0, 4));
        }
    }
}
