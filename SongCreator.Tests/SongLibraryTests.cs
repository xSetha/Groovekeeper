using System.IO;
using SongCreator.IO;
using SongCreator.Models;

namespace SongCreator.Tests
{
    public class SongLibraryTests : IDisposable
    {
        private readonly string _dir = Directory.CreateTempSubdirectory("SongCreatorTests").FullName;
        private readonly SongLibrary _library;

        public SongLibraryTests()
        {
            _library = new SongLibrary(Path.Combine(_dir, "library.db"));
        }

        public void Dispose() => Directory.Delete(_dir, recursive: true);

        private static Song MakeSong(string title, string artist = "", string key = "")
        {
            var song = new Song { Title = title, Artist = artist, Key = key };
            var verse = new Section("Verse 1");
            verse.Lines.Add(new SongLine("Hello there").WithChord(0, "G"));
            song.Sections.Add(verse);
            return song;
        }

        [Fact]
        public void StartsEmpty()
        {
            Assert.Empty(_library.ListSongs());
            Assert.Empty(_library.ListSetlists());
        }

        [Fact]
        public void AddedSongLoadsBackTheSame()
        {
            var song = MakeSong("Amazing Grace", "John Newton", "G");
            long id = _library.AddSong(song);

            var loaded = _library.LoadSong(id);
            Assert.NotNull(loaded);
            Assert.Equal(SongTextWriter.ToText(song), SongTextWriter.ToText(loaded));
            Assert.Equal(new SongSummary(id, "Amazing Grace", "John Newton", "G"), Assert.Single(_library.ListSongs()));
        }

        [Fact]
        public void UpdatesASong()
        {
            long id = _library.AddSong(MakeSong("Draft"));
            var song = MakeSong("Final", key: "D");
            _library.UpdateSong(id, song);

            Assert.Equal("Final", _library.LoadSong(id)!.Title);
            Assert.Equal(new SongSummary(id, "Final", "", "D"), Assert.Single(_library.ListSongs()));
        }

        [Fact]
        public void ListsSongsByTitleIgnoringCase()
        {
            _library.AddSongs([MakeSong("b song"), MakeSong("C song"), MakeSong("A song")]);
            Assert.Equal(["A song", "b song", "C song"], _library.ListSongs().Select(s => s.Title));
        }

        [Fact]
        public void LoadingAMissingSongGivesNull()
        {
            Assert.Null(_library.LoadSong(42));
        }

        [Fact]
        public void KeepsSongsWhenReopened()
        {
            _library.AddSong(MakeSong("Kept"));
            var reopened = new SongLibrary(Path.Combine(_dir, "library.db"));
            Assert.Equal("Kept", Assert.Single(reopened.ListSongs()).Title);
        }

        [Fact]
        public void SavesAndLoadsASetlistInOrder()
        {
            var ids = _library.AddSongs([MakeSong("One"), MakeSong("Two")]);
            long setlistId = _library.SaveSetlist(null, "Friday", [ids[1], ids[0]]);

            var setlist = _library.LoadSetlist(setlistId)!;
            Assert.Equal("Friday", setlist.Name);
            Assert.Equal([ids[1], ids[0]], setlist.Songs);

            _library.SaveSetlist(setlistId, "Saturday", [ids[0]]);
            setlist = _library.LoadSetlist(setlistId)!;
            Assert.Equal("Saturday", setlist.Name);
            Assert.Equal([ids[0]], setlist.Songs);
            Assert.Equal(["Saturday"], _library.ListSetlists().Select(s => s.Name));
        }

        [Fact]
        public void DeletingASongTakesItOutOfSetlists()
        {
            var ids = _library.AddSongs([MakeSong("One"), MakeSong("Two")]);
            long setlistId = _library.SaveSetlist(null, "Gig", [ids[0], ids[1]]);
            Assert.Equal(1, _library.SetlistCountFor(ids[0]));

            _library.DeleteSong(ids[0]);

            Assert.Equal(["Two"], _library.ListSongs().Select(s => s.Title));
            Assert.Equal([ids[1]], _library.LoadSetlist(setlistId)!.Songs);
        }

        [Fact]
        public void DeletesASetlistButNotItsSongs()
        {
            long songId = _library.AddSong(MakeSong("One"));
            long setlistId = _library.SaveSetlist(null, "Gig", [songId]);

            _library.DeleteSetlist(setlistId);

            Assert.Null(_library.LoadSetlist(setlistId));
            Assert.Single(_library.ListSongs());
        }

        [Fact]
        public void BackupIsAWorkingCopy()
        {
            _library.AddSong(MakeSong("Backed up"));
            string backup = Path.Combine(_dir, "backup.db");

            _library.BackupTo(backup);

            Assert.Equal("Backed up", Assert.Single(new SongLibrary(backup).ListSongs()).Title);
        }
    }
}
