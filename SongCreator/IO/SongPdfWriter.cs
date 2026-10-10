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
        private const float NoteFontSize = 9.5f;
        private const string ChordColor = "#B4400F";
        private const string MutedColor = "#6B6F76";
        private const float MarginCm = 2;

        // The printed song's measures in points, to put notes where they float in the editor.
        private const float PointsPerCm = 72 / 2.54f;
        private const float SongCharWidth = SongFontSize * 0.5498f;   // a Consolas letter is 0.55 em wide
        private const float SongRowHeight = SongFontSize * 1.17f;     // a row of Consolas text
        private const float SectionStart = 12 + SongRowHeight + 2;    // a section's top padding and heading

        /// <summary>A note as printed: its offset from the top left of the printed line it goes with, in points.</summary>
        public record PlacedNote(SongNote Note, float X, float Y);

        /// <summary>How many letters of a song's lyrics fit across a printed page; the editor marks this edge.</summary>
        public static int PrintedColumns => (int)((PageSizes.A4.Width - 2 * MarginCm * PointsPerCm) / SongCharWidth);

        static SongPdfWriter()
        {
            QuestPDF.Settings.License = LicenseType.Community;
            // Segoe UI and Consolas ship with every Windows install; QuestPDF ignores system fonts unless told otherwise.
            QuestPDF.Settings.UseSystemFonts = true;
        }

        /// <param name="chordStyle">How chords (and keys) are written: letters, Do Re Mi, or Roman numerals in each song's key (songs without a key keep letters).</param>
        /// <param name="collapseRepeats">Print a section that is an exact copy of an earlier one as a repeat (see <see cref="RepeatedSections"/>).</param>
        public static byte[] Create(IReadOnlyList<Song> songs, bool tableOfContents, ChordStyle chordStyle = ChordStyle.Letters,
            bool collapseRepeats = false)
        {
            return Document.Create(document =>
            {
                document.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.Margin(MarginCm, Unit.Centimetre);
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
                            column.Item().Section(SectionId(i)).EnsureSpace(110).Element(container => ComposeSong(container, songs[i], chordStyle, collapseRepeats));
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
                var lines = ContentLines(section);
                if (lines.Count == 0)
                    continue;
                // The name without case, then the lines with something on them: chord row and lyric row.
                string printed = section.Name.Trim().ToUpperInvariant() + "\n" +
                    string.Join("\n", lines.Select(l => SongTextWriter.ChordLine(l) + "\n" + l.Text.TrimEnd()));
                if (!seen.Add(printed))
                    repeated.Add(section);
            }
            return repeated;
        }

        private static List<SongLine> ContentLines(Section section) =>
            section.Lines.Where(l => l.Text.Trim().Length > 0 || l.Chords.Count > 0).ToList();

        /// <summary>
        /// Where each note is printed. A note goes with the line its <see cref="SongNote.PrintRow"/> is on, moved across
        /// by its column and down by how far it was towards the next line (above the first line or below the last, it
        /// goes with that one). A note over a line that isn't printed, in a collapsed repeat, goes with the printed line
        /// before it.
        /// </summary>
        public static Dictionary<SongLine, List<PlacedNote>> PlaceNotes(Song song, IReadOnlySet<Section> collapsed)
        {
            var lines = song.Sections.SelectMany(s => s.Lines.Select(line => (Line: line, Section: s))).ToList();
            var placed = new Dictionary<SongLine, List<PlacedNote>>();
            foreach (var note in song.Notes)
            {
                if (lines.Count == 0)
                    break;
                int index = Math.Clamp((int)Math.Floor(note.PrintRow), 0, lines.Count - 1);
                double towardsNext = note.PrintRow - index;
                int printed = Enumerable.Range(0, index + 1).Reverse().Concat(Enumerable.Range(index + 1, lines.Count - index - 1))
                    .FirstOrDefault(i => !collapsed.Contains(lines[i].Section), -1);
                if (printed < 0)
                    continue;   // nothing of the song is printed but repeats

                // How far down the next printed line starts: this line's rows, and a heading when a section starts there.
                var (line, section) = lines[printed];
                bool sectionStarts = printed + 1 < lines.Count && lines[printed + 1].Section != section;
                float lineHeight = ((line.Chords.Count > 0 ? 1 : 0) + (line.Text.Trim().Length > 0 || line.Chords.Count == 0 ? 1 : 0)) * SongRowHeight;
                float y = (float)(towardsNext * (lineHeight + (sectionStarts ? SectionStart : 0)));
                if (!placed.TryGetValue(line, out var list))
                    placed[line] = list = [];
                list.Add(new PlacedNote(note, (float)(note.Column * SongCharWidth), y));
            }
            return placed;
        }

        /// <summary>How each chord of the song is written in the PDF, or null to write it as the song has it.</summary>
        public static Func<string, string>? ChordDisplay(Song song, ChordStyle chordStyle) => chordStyle switch
        {
            ChordStyle.Solfege => NoteNames.ToSolfege,
            ChordStyle.Numerals when MusicKeys.TryParse(song.Key, out _, out _) => name => RomanNumerals.Of(name, song.Key) ?? name,
            _ => null,
        };

        /// <summary>The song's key as the "Key:" line writes it: in Do Re Mi when the chords are.</summary>
        public static string KeyText(Song song, ChordStyle chordStyle) =>
            chordStyle == ChordStyle.Solfege ? NoteNames.ToSolfege(song.Key) : song.Key;

        private static void ComposeSong(IContainer container, Song song, ChordStyle chordStyle, bool collapseRepeats)
        {
            var repeated = collapseRepeats ? RepeatedSections(song) : new HashSet<Section>();
            var notes = PlaceNotes(song, repeated);
            var display = ChordDisplay(song, chordStyle);
            string key = KeyText(song, chordStyle);

            container.Column(column =>
            {
                column.Item().Text(song.DisplayTitle).FontSize(18).Bold();
                if (song.Artist.Length > 0)
                    column.Item().Text(song.Artist).FontSize(11).FontColor(MutedColor);

                if (song.Key.Length > 0)
                    column.Item().PaddingTop(4).Text($"Key: {key}").FontSize(9).FontColor(MutedColor);

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

                    // Printed as the editor shows it: every section, even an empty one, and its blank lines.
                    var lines = section.Lines;

                    // The heading stays with the section's first line, so it's never stranded at the bottom of a page.
                    column.Item().PaddingTop(12).ShowEntire().Column(start =>
                    {
                        start.Item().PaddingBottom(2).Text($"[{section.Name}]")
                            .FontFamily(SongFont).FontSize(SongFontSize).Bold().FontColor(MutedColor);
                        if (lines.Count > 0)
                            start.Item().Element(pair => ComposeLine(pair, lines[0], display, notes.GetValueOrDefault(lines[0])));
                    });
                    foreach (var line in lines.Skip(1))
                        column.Item().ShowEntire().Element(pair => ComposeLine(pair, line, display, notes.GetValueOrDefault(line)));   // never split a chord line from its lyric
                }
            });
        }

        private static void ComposeLine(IContainer container, SongLine line, Func<string, string>? display, List<PlacedNote>? notes)
        {
            if (notes == null)
            {
                ComposeLineText(container, line, display);
                return;
            }
            // Notes float over the song as in the editor, so they're drawn on top of the line and may reach past it.
            container.Layers(layers =>
            {
                layers.PrimaryLayer().Element(text => ComposeLineText(text, line, display));
                foreach (var note in notes)
                    layers.Layer().OffsetX(note.X).OffsetY(note.Y).Unconstrained()
                        .Text(note.Note.Text).FontFamily(TextFont).FontSize(NoteFontSize).Italic().FontColor(MutedColor);
            });
        }

        private static void ComposeLineText(IContainer container, SongLine line, Func<string, string>? display)
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
                else if (line.Chords.Count == 0)
                    column.Item().Text(" ").FontFamily(SongFont).FontSize(SongFontSize);   // a blank line keeps its height
            });
        }
    }
}
