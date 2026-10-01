using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using SongCreator.Models;

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

        public static byte[] Create(IReadOnlyList<Song> songs, bool tableOfContents)
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
                            column.Item().Section(SectionId(i)).EnsureSpace(110).Element(container => ComposeSong(container, songs[i]));
                        }
                    });
                });
            })
            .WithMetadata(new DocumentMetadata { Title = songs.Count == 1 ? songs[0].DisplayTitle : "Songbook", Creator = "SongCreator" })
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

        private static void ComposeSong(IContainer container, Song song)
        {
            container.Column(column =>
            {
                column.Item().Text(song.DisplayTitle).FontSize(18).Bold();
                if (song.Artist.Length > 0)
                    column.Item().Text(song.Artist).FontSize(11).FontColor(MutedColor);

                if (song.Key.Length > 0)
                    column.Item().PaddingTop(4).Text($"Key: {song.Key}").FontSize(9).FontColor(MutedColor);

                foreach (var section in song.Sections)
                {
                    if (section.IsRepeat)
                    {
                        column.Item().PaddingTop(12).Text(text =>
                        {
                            text.Span($"[{section.Name}]").FontFamily(SongFont).FontSize(SongFontSize).Bold().FontColor(MutedColor);
                            text.Span("  (repeat)").FontSize(9).Italic().FontColor(MutedColor);
                        });
                        continue;
                    }

                    var lines = section.Lines.Where(l => l.Text.Trim().Length > 0 || l.Chords.Count > 0).ToList();
                    if (lines.Count == 0)
                        continue;

                    // The heading stays with the section's first line, so it's never stranded at the bottom of a page.
                    column.Item().PaddingTop(12).ShowEntire().Column(start =>
                    {
                        start.Item().PaddingBottom(2).Text($"[{section.Name}]")
                            .FontFamily(SongFont).FontSize(SongFontSize).Bold().FontColor(MutedColor);
                        start.Item().Element(pair => ComposeLine(pair, lines[0]));
                    });
                    foreach (var line in lines.Skip(1))
                        column.Item().ShowEntire().Element(pair => ComposeLine(pair, line));   // never split a chord line from its lyric
                }
            });
        }

        private static void ComposeLine(IContainer container, SongLine line)
        {
            container.Column(column =>
            {
                if (line.Chords.Count > 0)
                {
                    // Non-breaking spaces keep the column padding intact and stop the chord line from wrapping.
                    string chords = SongTextWriter.ChordLine(line).Replace(' ', ' ');
                    column.Item().Text(chords).FontFamily(SongFont).FontSize(SongFontSize).Bold().FontColor(ChordColor);
                }
                if (line.Text.Trim().Length > 0)
                    column.Item().Text(line.Text.TrimEnd()).FontFamily(SongFont).FontSize(SongFontSize);
            });
        }
    }
}
