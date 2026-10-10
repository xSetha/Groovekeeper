using System.IO;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Music;
using SongCreator.Services;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class SetlistViewModelTests : IDisposable
    {
        private readonly FakeDialogService _dialogs = new();
        private readonly string _dir = Directory.CreateTempSubdirectory("SongCreatorTests").FullName;
        private readonly SongLibrary _library;

        public SetlistViewModelTests()
        {
            _library = new SongLibrary(Path.Combine(_dir, "library.db"));
        }

        public void Dispose() => Directory.Delete(_dir, recursive: true);

        private static string Sample(string name) => Path.Combine(AppContext.BaseDirectory, "samples", name + ".txt");

        /// <summary>Adds a sample song to the library and returns it as the library list shows it.</summary>
        private SongSummary LibrarySample(string name)
        {
            long id = _library.AddSong(IO.SongFile.Load(Sample(name)));
            return _library.ListSongs().Single(s => s.Id == id);
        }

        /// <summary>A song file in the temp folder, so tests can change or delete it.</summary>
        private string SongFile(string name, string text)
        {
            string path = Path.Combine(_dir, name + ".txt");
            File.WriteAllText(path, text);
            return path;
        }

        [Fact]
        public void TheChordsChoiceFollowsTheEditorUnlessItIsOnRomanNumerals()
        {
            var vm = Create();

            vm.FollowNaming(NoteNaming.Solfege);
            Assert.Equal(ChordStyle.Solfege, vm.ChordStyle);

            vm.ChordStyle = ChordStyle.Numerals;
            vm.FollowNaming(NoteNaming.Letters);
            Assert.Equal(ChordStyle.Numerals, vm.ChordStyle);
        }

        private SetlistViewModel Create() => new(_dialogs, new LibraryViewModel(_library, _dialogs));

        /// <summary>A view model with a new, selected setlist holding the given library songs.</summary>
        private SetlistViewModel CreateWith(params SongSummary[] songs)
        {
            var setlist = Create();
            setlist.New();
            foreach (var song in songs)
                setlist.AddSongCommand.Execute(song);
            return setlist;
        }

        private LibrarySetlist Saved(SetlistViewModel setlist) => _library.LoadSetlist(setlist.SelectedSetlist!.Id)!;

        [Fact]
        public void ANewSetlistIsSavedInTheLibraryAndSelected()
        {
            var setlist = Create();
            int focusRequests = 0;
            setlist.FocusNameRequested += (_, _) => focusRequests++;

            setlist.New();

            var saved = Assert.Single(_library.ListSetlists());
            Assert.Equal("New setlist", saved.Name);
            Assert.Equal(saved.Id, setlist.SelectedSetlist?.Id);
            Assert.Equal("New setlist", setlist.Name);
            Assert.True(setlist.IsEmpty);
            Assert.Equal(1, focusRequests);
        }

        [Fact]
        public void AddedSongsAreSavedRightAway()
        {
            var grace = LibrarySample("Amazing Grace");
            var sun = LibrarySample("House of the Rising Sun");
            var setlist = CreateWith(grace, sun);

            Assert.Equal([1, 2], setlist.Items.Select(i => i.Position));
            Assert.Equal([grace.Id, sun.Id], Saved(setlist).Songs);
        }

        [Fact]
        public void ASongCanBeAddedAtAPlace()
        {
            var grace = LibrarySample("Amazing Grace");
            var sun = LibrarySample("House of the Rising Sun");
            var setlist = CreateWith(grace, grace);

            setlist.AddSong(sun, 1);

            Assert.Equal([grace.Id, sun.Id, grace.Id], setlist.Items.Select(i => i.SongId));
            Assert.Equal([grace.Id, sun.Id, grace.Id], Saved(setlist).Songs);
        }

        [Fact]
        public void NoSongIsAddedWithoutASelectedSetlist()
        {
            var setlist = Create();
            setlist.AddSongCommand.Execute(LibrarySample("Amazing Grace"));
            Assert.Empty(setlist.Items);
            Assert.Empty(_library.ListSetlists());
        }

        [Fact]
        public void OrderAndRemovalsAreSavedRightAway()
        {
            var grace = LibrarySample("Amazing Grace");
            var sun = LibrarySample("House of the Rising Sun");
            var graceCopy = LibrarySample("Amazing Grace");
            var setlist = CreateWith(grace, sun, graceCopy);

            setlist.MoveUpCommand.Execute(setlist.Items[1]);
            setlist.Move(2, 0);
            setlist.RemoveCommand.Execute(setlist.Items[2]);

            Assert.Equal([1, 2], setlist.Items.Select(i => i.Position));
            Assert.Equal([graceCopy.Id, sun.Id], Saved(setlist).Songs);
        }

        [Fact]
        public void MovingPastTheEndsDoesNothing()
        {
            var grace = LibrarySample("Amazing Grace");
            var sun = LibrarySample("House of the Rising Sun");
            var setlist = CreateWith(grace, sun);

            setlist.MoveUpCommand.Execute(setlist.Items[0]);
            setlist.MoveDownCommand.Execute(setlist.Items[1]);
            setlist.Move(0, 5);

            Assert.Equal([grace.Id, sun.Id], setlist.Items.Select(i => i.SongId));
        }

        [Fact]
        public void RenamingSavesSortsAndKeepsTheSetlistSelected()
        {
            var setlist = Create();
            setlist.New();
            setlist.Name = "Friday";
            setlist.New();
            long id = setlist.SelectedSetlist!.Id;

            setlist.Name = "  Concert  ";

            Assert.Equal(["Concert", "Friday"], setlist.Setlists.Select(s => s.Name));
            Assert.Equal(id, setlist.SelectedSetlist?.Id);
            Assert.Equal("Concert", setlist.Name);
            Assert.Equal("Concert", Saved(setlist).Name);
        }

        [Fact]
        public void ABlankNameIsIgnored()
        {
            var setlist = Create();
            setlist.New();
            setlist.Name = "   ";
            Assert.Equal("New setlist", setlist.Name);
            Assert.Equal("New setlist", Saved(setlist).Name);
        }

        [Fact]
        public void SelectingASetlistShowsItsSongs()
        {
            var grace = LibrarySample("Amazing Grace");
            var sun = LibrarySample("House of the Rising Sun");
            var setlist = CreateWith(sun);
            setlist.Name = "Friday";
            setlist.New();
            setlist.Name = "Sunday";
            setlist.AddSongCommand.Execute(grace);

            var reopened = Create();
            reopened.SelectedSetlist = reopened.Setlists.Single(s => s.Name == "Friday");

            Assert.Equal("Friday", reopened.Name);
            Assert.Equal([sun.Id], reopened.Items.Select(i => i.SongId));
            Assert.Equal(sun.Id, Assert.Single(Saved(reopened).Songs));   // showing it didn't change it
        }

        [Fact]
        public void TheSameSongCanBeInTwoSetlists()
        {
            var grace = LibrarySample("Amazing Grace");
            var setlist = CreateWith(grace);
            long first = setlist.SelectedSetlist!.Id;
            setlist.New();
            setlist.AddSongCommand.Execute(grace);

            Assert.Equal(grace.Id, Assert.Single(_library.LoadSetlist(first)!.Songs));
            Assert.Equal(grace.Id, Assert.Single(Saved(setlist).Songs));
            Assert.Equal(2, _library.SetlistCountFor(grace.Id));
        }

        [Fact]
        public void RefreshShowsSongsChangedOrDeletedInTheLibrary()
        {
            var grace = LibrarySample("Amazing Grace");
            var sun = LibrarySample("House of the Rising Sun");
            var setlist = CreateWith(grace, sun);
            var song = _library.LoadSong(grace.Id)!;
            song.Title = "Grace (live)";
            _library.UpdateSong(grace.Id, song);
            _library.DeleteSong(sun.Id);

            setlist.Refresh();

            Assert.Equal(["Grace (live)"], setlist.Items.Select(i => i.Song.Title));
        }

        [Fact]
        public void OpeningASongAsksForTheSongEditor()
        {
            var grace = LibrarySample("Amazing Grace");
            var setlist = CreateWith(grace);
            long? opened = null;
            setlist.OpenSongRequested += (_, id) => opened = id;

            setlist.OpenSongCommand.Execute(setlist.Items[0]);

            Assert.Equal(grace.Id, opened);
        }

        [Fact]
        public void DeletingASetlistKeepsItsSongsAndSelectsTheNextOne()
        {
            var setlist = CreateWith(LibrarySample("Amazing Grace"));
            setlist.Name = "A";
            setlist.New();
            setlist.Name = "B";
            setlist.SelectedSetlist = setlist.Setlists[0];

            setlist.Delete();

            Assert.Single(_dialogs.Confirmations);
            Assert.Equal(["B"], _library.ListSetlists().Select(s => s.Name));
            Assert.Equal("B", setlist.Name);
            Assert.Empty(setlist.Items);
            Assert.Single(_library.ListSongs());

            setlist.Delete();
            Assert.Null(setlist.SelectedSetlist);
            Assert.False(setlist.HasSetlists);
        }

        [Fact]
        public void ASetlistIsKeptWhenTheDeleteIsCancelled()
        {
            var setlist = Create();
            setlist.New();
            _dialogs.ConfirmAnswer = false;

            setlist.Delete();

            Assert.Single(_library.ListSetlists());
            Assert.NotNull(setlist.SelectedSetlist);
        }

        [Fact]
        public void ImportsASetlistFileAndItsSongsIntoTheLibrary()
        {
            SongFile("Grace", File.ReadAllText(Sample("Amazing Grace")));
            SongFile("Sun", File.ReadAllText(Sample("House of the Rising Sun")));
            string path = Path.Combine(_dir, "friday.setlist");
            File.WriteAllText(path, """{ "name": "Friday", "songs": [ { "path": "Sun.txt", "key": "Em" }, { "path": "Grace.txt", "key": "" } ] }""");

            var setlist = Create();
            setlist.ImportFile(path);

            Assert.Equal("Friday", setlist.Name);
            Assert.Equal(["House of the Rising Sun", "Amazing Grace"], setlist.Items.Select(i => i.Song.Title));
            Assert.Equal(2, _library.ListSongs().Count);
            Assert.Equal(2, setlist.Library.Songs.Count);
            Assert.Equal(["Friday"], _library.ListSetlists().Select(s => s.Name));
            Assert.Equal("Friday", setlist.SelectedSetlist?.Name);
            Assert.Equal(["Imported Friday"], _dialogs.SuccessNotifications);
        }

        [Fact]
        public void AMissingSongIsReportedAndSkippedOnImport()
        {
            SongFile("Grace", File.ReadAllText(Sample("Amazing Grace")));
            string path = Path.Combine(_dir, "set.setlist");
            File.WriteAllText(path, """{ "name": "Set", "songs": [ { "path": "Gone.txt", "key": "" }, { "path": "Grace.txt", "key": "A" } ] }""");

            var setlist = Create();
            setlist.ImportFile(path);

            Assert.Equal(["Amazing Grace"], setlist.Items.Select(i => i.Song.Title));
            Assert.Contains("Gone.txt", Assert.Single(_dialogs.ErrorNotifications));
        }

        [Fact]
        public void ABrokenSetlistFileIsReported()
        {
            string path = Path.Combine(_dir, "broken.setlist");
            File.WriteAllText(path, "not json");

            Create().ImportFile(path);
            Assert.Contains("broken.setlist", Assert.Single(_dialogs.ErrorNotifications));
            Assert.Empty(_library.ListSetlists());
        }

        [Fact]
        public void ExportsThePdf()
        {
            var setlist = CreateWith(LibrarySample("Amazing Grace"));
            setlist.OpenWhenDone = true;
            _dialogs.PdfPath = Path.Combine(_dir, "set.pdf");

            setlist.Export();

            Assert.True(new FileInfo(_dialogs.PdfPath).Length > 0);
            Assert.Equal([_dialogs.PdfPath], _dialogs.Opened);
            Assert.Equal(["Exported set.pdf"], _dialogs.SuccessNotifications);
        }

        [Fact]
        public void TheSetlistsTabShowsTheLatestSongs()
        {
            var main = new MainViewModel(_dialogs, _library);
            main.Setlists.New();
            main.Setlists.AddSongCommand.Execute(LibrarySample("Amazing Grace"));
            main.IsSetlistsViewActive = false;
            var song = _library.LoadSong(main.Setlists.Items[0].SongId)!;
            song.Title = "Renamed";
            _library.UpdateSong(main.Setlists.Items[0].SongId, song);

            main.ShowSetlistsCommand.Execute(null);

            Assert.True(main.IsSetlistsViewActive);
            Assert.Equal("Renamed", main.Setlists.Items[0].Song.Title);
        }

        [Fact]
        public void ASongOpenedFromASetlistIsEditedInTheSongEditor()
        {
            var main = new MainViewModel(_dialogs, _library);
            main.ShowSetlistsCommand.Execute(null);
            var grace = LibrarySample("Amazing Grace");
            main.Setlists.New();
            main.Setlists.AddSongCommand.Execute(grace);

            main.Setlists.OpenSongCommand.Execute(main.Setlists.Items[0]);

            Assert.False(main.IsSetlistsViewActive);
            Assert.True(main.IsEditingSong);
            Assert.Equal(grace.Id, main.ActiveDocument?.LibraryId);
        }

        [Fact]
        public void SongShortcutsDoNothingOnTheSetlistsTab()
        {
            var main = new MainViewModel(_dialogs, _library);
            main.NewSong();
            main.ShowSetlistsCommand.Execute(null);

            main.SaveCommand.Execute(null);

            Assert.False(main.IsEditingSong);
            Assert.Empty(_library.ListSongs());
        }
    }
}
