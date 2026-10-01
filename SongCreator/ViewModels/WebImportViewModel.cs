using System.Globalization;
using System.Text.RegularExpressions;
using SongCreator.IO;
using SongCreator.Models;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// The Import from Web window: the user finds a song page in the built-in browser, and the chords-over-lyrics
    /// text they select (or the page's chord sheet) becomes a new song. The app itself never fetches songs.
    /// </summary>
    public partial class WebImportViewModel : ObservableObject
    {
        private const string SearchEngine = "https://duckduckgo.com/?q=";

        private string _searchText = "";
        private string? _error;

        // "… Chords", "… Chords and Lyrics", "… (Lyrics and Chords)": what the page is, not part of the song's name.
        [GeneratedRegex(@"(\s*[\(\[][^\)\]]*\b(chords?|tabs?|lyrics)\b[^\)\]]*[\)\]]|(\s+(and|&|\+))?\s+(chords?|tabs?|lyrics|ukulele|guitar)\b)+\s*$", RegexOptions.IgnoreCase)]
        private static partial Regex PageWordsRegex();

        public string SearchText
        {
            get => _searchText;
            set => SetProperty(ref _searchText, value);
        }

        /// <summary>Why the last import failed, or null.</summary>
        public string? Error
        {
            get => _error;
            private set => SetProperty(ref _error, value);
        }

        /// <summary>The song made by the last successful import, for the window's caller to open.</summary>
        public Song? ImportedSong { get; private set; }

        /// <summary>A web search for the song's chords.</summary>
        public static string SearchUrl(string songName) => SearchEngine + Uri.EscapeDataString($"{songName.Trim()} chords");

        /// <summary>
        /// Turns chords-over-lyrics text into a song (as pasting does), named after the page. Returns false, with
        /// <see cref="Error"/> set, if the text has no chord row.
        /// </summary>
        public bool Import(string text, string pageTitle)
        {
            string normalized = text.Replace(' ', ' ');
            if (!normalized.Replace("\r\n", "\n").Split('\n').Any(row => row.Trim().Length > 0 && SongTextReader.IsChordLine(row)))
            {
                Error = "No chords found. Select the song's chords and lyrics on the page, then press Import.";
                return false;
            }

            var song = new Song();
            var line = new SongLine();
            var section = new Section("Verse 1");
            section.Lines.Add(line);
            song.Sections.Add(section);
            new SongDocumentViewModel(song).PasteLines(line, 0, text);

            (song.Title, song.Artist) = GuessTitle(pageTitle);
            ImportedSong = song;
            Error = null;
            return true;
        }

        /// <summary>
        /// Title and artist from a page title, e.g. "AMAZING GRACE CHORDS by John Newton @ Ultimate-Guitar.Com"
        /// → ("Amazing Grace", "John Newton"). Either part may be empty.
        /// </summary>
        public static (string Title, string Artist) GuessTitle(string pageTitle)
        {
            string title = pageTitle;
            // Site names come after " @ ", " | " or " - ".
            foreach (string separator in new[] { " @ ", " | ", " - " })
            {
                int index = title.IndexOf(separator, StringComparison.Ordinal);
                if (index > 0)
                    title = title[..index];
            }

            string artist = "";
            var byArtist = Regex.Match(title, @"^(.*?)\s+by\s+(.+)$", RegexOptions.IgnoreCase);
            if (byArtist.Success)
            {
                title = byArtist.Groups[1].Value;
                artist = byArtist.Groups[2].Value;
            }
            return (Tidy(title), Tidy(artist));
        }

        private static string Tidy(string text)
        {
            string tidy = PageWordsRegex().Replace(text.Trim(), "").Trim();
            // ALL-CAPS page titles read better as Title Case.
            return tidy.Any(char.IsLetter) && tidy == tidy.ToUpperInvariant()
                ? CultureInfo.InvariantCulture.TextInfo.ToTitleCase(tidy.ToLowerInvariant())
                : tidy;
        }
    }
}
