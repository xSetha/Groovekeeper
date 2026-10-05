using System.IO;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class LibraryViewModelTests : IDisposable
    {
        private readonly FakeDialogService _dialogs = new();
        private readonly string _dir = Directory.CreateTempSubdirectory("SongCreatorTests").FullName;
        private readonly SongLibrary _library;

        public LibraryViewModelTests()
        {
            _library = new SongLibrary(Path.Combine(_dir, "library", "library.db"));
        }

        public void Dispose() => Directory.Delete(_dir, recursive: true);

        private LibraryViewModel CreateWith(params Song[] songs)
        {
            _library.AddSongs(songs);
            return new LibraryViewModel(_library, _dialogs);
        }

        [Theory]
        [InlineData("grace", "Amazing Grace")]
        [InlineData("NEWTON", "Amazing Grace")]
        [InlineData("am", "Amazing Grace", "House of the Rising Sun")]
        [InlineData("", "Amazing Grace", "House of the Rising Sun")]
        public void SearchMatchesTitleArtistOrKey(string search, params string[] expected)
        {
            var library = CreateWith(
                new Song { Title = "Amazing Grace", Artist = "John Newton", Key = "G" },
                new Song { Title = "House of the Rising Sun", Artist = "Traditional", Key = "Am" });

            library.SearchText = search;

            Assert.Equal(expected, library.Songs.Select(s => s.Title));
        }

        [Fact]
        public void IsEmptyOnlyWithoutSongs()
        {
            var library = CreateWith();
            Assert.True(library.IsEmpty);

            _library.AddSong(new Song { Title = "One" });
            library.Refresh();
            library.SearchText = "nothing matches";

            Assert.False(library.IsEmpty);
            Assert.Empty(library.Songs);
        }

        [Fact]
        public void DeleteAsksFirstAndMentionsSetlists()
        {
            var library = CreateWith(new Song { Title = "One" });
            var song = library.Songs[0];
            _library.SaveSetlist(null, "Gig", [song.Id]);
            _dialogs.ConfirmAnswer = false;

            library.DeleteCommand.Execute(song);

            Assert.Contains("1 setlist", Assert.Single(_dialogs.Confirmations));
            Assert.Single(library.Songs);

            _dialogs.ConfirmAnswer = true;
            library.DeleteCommand.Execute(song);
            Assert.Empty(library.Songs);
            Assert.Empty(_library.ListSongs());
        }

        [Fact]
        public async Task ImportAddsCopiesAndLeavesTheFilesAlone()
        {
            string sample = Path.Combine(AppContext.BaseDirectory, "samples", "Amazing Grace.txt");
            string cho = Path.Combine(_dir, "song.cho");
            File.WriteAllText(cho, "{title: Pro}\n[G]Hi\n");
            string before = File.ReadAllText(cho);
            var library = CreateWith();

            await library.ImportSongsAsync([sample, cho, Path.Combine(_dir, "missing.txt")]);

            Assert.Equal(["Amazing Grace", "Pro"], library.Songs.Select(s => s.Title));
            Assert.Equal(before, File.ReadAllText(cho));
            Assert.Contains("missing.txt", Assert.Single(_dialogs.Errors));
        }
    }
}
