using System.IO;
using SongCreator.IO;
using SongCreator.Models;
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

        private SetlistViewModel Create() => new(_dialogs, _library);

        [Fact]
        public void AddedSongsStartInTheirOwnKey()
        {
            var setlist = Create();
            setlist.AddSongs([LibrarySample("Amazing Grace"), LibrarySample("House of the Rising Sun")]);

            Assert.Equal([1, 2], setlist.Items.Select(i => i.Position));
            Assert.Equal(["G", "Am"], setlist.Items.Select(i => i.Key));
            Assert.Equal("original key", setlist.Items[0].KeyNote);
            Assert.True(setlist.IsDirty);
        }

        [Fact]
        public void KeyOptionsAreTheTwelveKeysOfTheSameMode()
        {
            var item = new SetlistItemViewModel(IO.SongFile.Load(Sample("House of the Rising Sun")), 1);
            Assert.Equal(["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"], item.KeyOptions);
        }

        [Fact]
        public void ChangingTheKeyTransposesACopyForTheGig()
        {
            var song = IO.SongFile.Load(Sample("Amazing Grace"));
            var item = new SetlistItemViewModel(song, 1) { Key = "Bb" };

            Assert.Equal(3, item.Semitones);
            Assert.Equal("+3 from G", item.KeyNote);
            var played = item.SongToPlay();
            Assert.Equal("Bb", played.Key);
            Assert.Equal("Bb", played.Sections[0].Lines[0].Chords[0].Name);
            Assert.Equal("G", song.Sections[0].Lines[0].Chords[0].Name);   // the song itself is untouched

            item.Key = "E";
            Assert.Equal(-3, item.Semitones);                               // the short way round
        }

        [Fact]
        public void ASongWithoutAKeyUsesTheDetectedOne()
        {
            var song = SongTextReader.Parse("Untitled\n\n[Verse]\nAm  F  C  G  Am\nla la");
            var item = new SetlistItemViewModel(song, 1) { Key = "Bm" };

            Assert.Equal("Am", item.OriginalKey);
            Assert.Equal("+2 from Am (detected)", item.KeyNote);
            Assert.Equal("Bm", item.SongToPlay().Key);
        }

        [Fact]
        public void ASongWithNoKeyAtAllPlaysAsWritten()
        {
            var song = SongTextReader.Parse("Untitled\n\n[Verse]\nla la");
            var item = new SetlistItemViewModel(song, 1);

            Assert.False(item.HasKey);
            Assert.Same(song, item.SongToPlay());
        }

        [Fact]
        public void SavesAndOpensTheOrderAndKeys()
        {
            var grace = LibrarySample("Amazing Grace");
            var sun = LibrarySample("House of the Rising Sun");
            var setlist = Create();
            setlist.Name = "Friday gig";
            setlist.AddSongs([grace, sun]);
            setlist.Items[1].Key = "Em";
            setlist.MoveUpCommand.Execute(setlist.Items[1]);

            Assert.True(setlist.Save());
            Assert.False(setlist.IsDirty);
            Assert.Equal(["Friday gig"], setlist.Setlists.Select(s => s.Name));

            var reopened = Create();
            reopened.OpenCommand.Execute(Assert.Single(reopened.Setlists));
            Assert.Equal("Friday gig", reopened.Name);
            Assert.Equal([sun.Id, grace.Id], reopened.Items.Select(i => i.SongId));
            Assert.Equal(["Em", "G"], reopened.Items.Select(i => i.Key));
            Assert.False(reopened.IsDirty);
        }

        [Fact]
        public void SavingAgainUpdatesTheSameSetlist()
        {
            var setlist = Create();
            setlist.AddSongs([LibrarySample("Amazing Grace")]);
            setlist.Save();
            setlist.Name = "Renamed";
            setlist.Save();

            Assert.Equal(["Renamed"], _library.ListSetlists().Select(s => s.Name));
        }

        [Fact]
        public void DeletingASetlistKeepsItsSongs()
        {
            var setlist = Create();
            setlist.AddSongs([LibrarySample("Amazing Grace")]);
            setlist.Save();

            setlist.Delete();

            Assert.Single(_dialogs.Confirmations);
            Assert.Empty(_library.ListSetlists());
            Assert.Empty(setlist.Items);
            Assert.False(setlist.IsSaved);
            Assert.Single(_library.ListSongs());
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
            Assert.Equal(["Em", "G"], setlist.Items.Select(i => i.Key));
            Assert.Equal(2, _library.ListSongs().Count);
            Assert.True(setlist.IsSaved);
            Assert.Equal(["Friday"], _library.ListSetlists().Select(s => s.Name));
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
            Assert.Contains("Gone.txt", Assert.Single(_dialogs.Errors));
        }

        [Fact]
        public void ABrokenSetlistFileIsReported()
        {
            string path = Path.Combine(_dir, "broken.setlist");
            File.WriteAllText(path, "not json");

            Create().ImportFile(path);
            Assert.Contains("broken.setlist", Assert.Single(_dialogs.Errors));
            Assert.Empty(_library.ListSetlists());
        }

        [Fact]
        public void ClosingAsksToSaveOnlyWhenChanged()
        {
            var setlist = Create();
            Assert.True(setlist.ConfirmClose());
            Assert.Empty(_dialogs.AskedToSave);

            setlist.AddSongs([LibrarySample("Amazing Grace")]);
            _dialogs.SaveAnswer = SaveChoice.Cancel;
            Assert.False(setlist.ConfirmClose());
            _dialogs.SaveAnswer = SaveChoice.DontSave;
            Assert.True(setlist.ConfirmClose());
        }

        [Fact]
        public void ExportsThePdfInTheChosenKeys()
        {
            var setlist = Create();
            setlist.OpenWhenDone = true;
            setlist.AddSongs([LibrarySample("Amazing Grace")]);
            setlist.Items[0].Key = "A";
            _dialogs.PdfPath = Path.Combine(_dir, "set.pdf");

            setlist.Export();

            Assert.True(new FileInfo(_dialogs.PdfPath).Length > 0);
            Assert.Equal([_dialogs.PdfPath], _dialogs.Opened);
        }

        [Fact]
        public void MainWindowOpensTheSetlist()
        {
            new MainViewModel(_dialogs, _library).SetlistCommand.Execute(null);
            Assert.NotNull(_dialogs.ShownSetlist);
        }
    }
}
