using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.IO
{
    /// <summary>
    /// Renders songs one after another into a single PDF songbook, chords above lyrics in a monospace font.
    /// </summary>
    public static class SongPdfWriter
    {
        private const string TextFont = "Segoe UI";
        private const string SongFont = "Consolas";   // monospace, so chord columns line up with the lyrics
        private const float SongFontSize = 10.5f;
        private const string ChordColor = "#B4400F";
        private const string MutedColor = "#6B6F76";

        static SongPdfWriter()
        {
            QuestPDF.Settings.License = LicenseType.Community;
            // Segoe UI and Consolas ship with every Windows install; QuestPDF ignores system fonts unless told otherwise.
            QuestPDF.Settings.UseSystemFonts = true;
        }

        /// <param name="romanNumerals">Write chords as Roman numerals in each song's key (songs without a key keep chord names).</param>
        /// <param name="collapseRepeats">Print a section that is an exact copy of an earlier one as a repeat (see <see cref="RepeatedSections"/>).</param>
        public static byte[] Create(IReadOnlyList<Song> songs, bool tableOfContents, bool romanNumerals = false,
            bool collapseRepeats = false)
        {
            return Document.Create(document =>
            {
                document.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(2, Unit.Centimetre);
                    page.DefaultTextStyle(style => style.FontFamily(TextFont).FontSize(10).FontColor(Colors.Black));

                    page.Content().Column(column =>
                    {
                        if (tableOfContents)
                        {
                            column.Item().Element(container => ComposeContents(container, songs));
                            column.Item().PageBreak();
                        }

                        for (int i = 0; i < songs.Count; i++)
                        {
                            if (i > 0)
                                column.Item().PaddingVertical(22).LineHorizontal(0.75f).LineColor(Colors.Grey.Lighten2);
                            // Keep a song's title from being stranded at the bottom of a page.
                            column.Item().Section(SectionId(i)).EnsureSpace(110).Element(container => ComposeSong(container, songs[i], romanNumerals, collapseRepeats));
                        }
                    });
                });
            })
            .WithMetadata(new DocumentMetadata { Title = songs.Count == 1 ? songs[0].DisplayTitle : "Songbook", Creator = "Groovekeeper" })
            .GeneratePdf();
        }

        private static string SectionId(int index) => $"song-{index}";

        private static void ComposeContents(IContainer container, IReadOnlyList<Song> songs)
        {
            container.Column(column =>
            {
                column.Item().PaddingBottom(18).Text("Contents").FontSize(24).Bold();
                for (int i = 0; i < songs.Count; i++)
                {
                    var song = songs[i];
                    column.Item().SectionLink(SectionId(i)).PaddingVertical(5).Row(row =>
                    {
                        row.ConstantItem(28).Text($"{i + 1}.").FontColor(MutedColor);
                        row.RelativeItem().Text(text =>
                        {
                            text.Span(song.DisplayTitle).SemiBold();
                            if (song.Artist.Length > 0)
                                text.Span($"  ·  {song.Artist}").FontColor(MutedColor);
                        });
                        row.AutoItem().Text(text => text.BeginPageNumberOfSection(SectionId(i)));
                    });
                }
            });
        }

        /// <summary>
        /// The sections that are exact copies of an earlier section: the same name (ignoring case), chords and lyrics.
        /// Blank lines and trailing spaces don't count, as they aren't printed.
        /// </summary>
        public static IReadOnlySet<Section> RepeatedSections(Song song)
        {
            var seen = new HashSet<string>();
            var repeated = new HashSet<Section>();
            foreach (var section in song.Sections.Where(s => !s.IsRepeat))
            {
                var lines = PrintedLines(section);
                if (lines.Count == 0)
                    continue;
                // The name without case, then the lines exactly as printed: chord row and lyric row.
                string printed = section.Name.Trim().ToUpperInvariant() + "\n" +
                    string.Join("\n", lines.Select(l => SongTextWriter.ChordLine(l) + "\n" + l.Text.TrimEnd()));
                if (!seen.Add(printed))
                    repeated.Add(section);
            }
            return repeated;
        }

        private static List<SongLine> PrintedLines(Section section) =>
            section.Lines.Where(l => l.Text.Trim().Length > 0 || l.Chords.Count > 0).ToList();

        private static void ComposeSong(IContainer container, Song song, bool romanNumerals, bool collapseRepeats)
        {
            var repeated = collapseRepeats ? RepeatedSections(song) : new HashSet<Section>();
            Func<string, string>? display = romanNumerals && MusicKeys.TryParse(song.Key, out _, out _)
                ? name => RomanNumerals.Of(name, song.Key) ?? name
                : null;

            container.Column(column =>
            {
                column.Item().Text(song.DisplayTitle).FontSize(18).Bold();
                if (song.Artist.Length > 0)
                    column.Item().Text(song.Artist).FontSize(11).FontColor(MutedColor);

                if (song.Key.Length > 0)
                    column.Item().PaddingTop(4).Text($"Key: {song.Key}").FontSize(9).FontColor(MutedColor);

                foreach (var section in song.Sections)
                {
                    if (section.IsRepeat || repeated.Contains(section))
                    {
                        column.Item().PaddingTop(12).Text(text =>
                        {
                            text.Span($"[{section.Name}]").FontFamily(SongFont).FontSize(SongFontSize).Bold().FontColor(MutedColor);
                            text.Span("  (repeat)").FontSize(9).Italic().FontColor(MutedColor);
                        });
                        continue;
                    }

                    var lines = PrintedLines(section);
                    if (lines.Count == 0)
                        continue;

                    // The heading stays with the section's first line, so it's never stranded at the bottom of a page.
                    column.Item().PaddingTop(12).ShowEntire().Column(start =>
                    {
                        start.Item().PaddingBottom(2).Text($"[{section.Name}]")
                            .FontFamily(SongFont).FontSize(SongFontSize).Bold().FontColor(MutedColor);
                        start.Item().Element(pair => ComposeLine(pair, lines[0], display));
                    });
                    foreach (var line in lines.Skip(1))
                        column.Item().ShowEntire().Element(pair => ComposeLine(pair, line, display));   // never split a chord line from its lyric
                }
            });
        }

        private static void ComposeLine(IContainer container, SongLine line, Func<string, string>? display)
        {
            container.Column(column =>
            {
                if (line.Chords.Count > 0)
                {
                    // Non-breaking spaces keep the column padding intact and stop the chord line from wrapping.
                    string chords = SongTextWriter.ChordLine(line, display).Replace(' ', ' ');
                    column.Item().Text(chords).FontFamily(SongFont).FontSize(SongFontSize).Bold().FontColor(ChordColor);
                }
                if (line.Text.Trim().Length > 0)
                    column.Item().Text(line.Text.TrimEnd()).FontFamily(SongFont).FontSize(SongFontSize);
            });
        }
    }
}
