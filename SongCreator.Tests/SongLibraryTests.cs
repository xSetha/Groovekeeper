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

        private static (string, double, double, double)[] NotesOf(Song song) =>
            song.Notes.Select(n => (n.Text, n.Column, n.Top, n.PrintRow)).ToArray();

        [Fact]
        public void KeepsASongsNotesBesideItsText()
        {
            var song = MakeSong("Noted");
            song.Notes.Add(new SongNote("build up here\nthen hold", 18.5, 120, 2.25));
            song.Notes.Add(new SongNote("capo 2", 0, -30, -0.5));
            long id = _library.AddSong(song);

            var loaded = _library.LoadSong(id)!;
            Assert.Equal([("build up here\nthen hold", 18.5, 120.0, 2.25), ("capo 2", 0.0, -30.0, -0.5)], NotesOf(loaded));
            Assert.DoesNotContain("build up", IO.SongTextWriter.ToText(loaded));   // never part of the song's text

            loaded.Notes.RemoveAt(1);
            loaded.Notes[0].Text = "softer";
            _library.UpdateSong(id, loaded);
            Assert.Equal([("softer", 18.5, 120.0, 2.25)], NotesOf(_library.LoadSong(id)!));
        }

        [Fact]
        public void DeletingASongDeletesItsNotes()
        {
            var song = MakeSong("Noted");
            song.Notes.Add(new SongNote("hey", 1, 2));
            long id = _library.AddSong(song);
            _library.DeleteSong(id);

            long again = _library.AddSong(MakeSong("Other"));
            Assert.Empty(_library.LoadSong(again)!.Notes);
        }

        [Fact]
        public void UpgradesALibraryFromBeforeNotes()
        {
            // A version 1 library, as the app made it before notes: songs and setlists only.
            string path = Path.Combine(_dir, "old.db");
            using (var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={path};Pooling=False"))
            {
                connection.Open();
                using var command = connection.CreateCommand();
                command.CommandText = """
                    CREATE TABLE songs (id INTEGER PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL, key TEXT NOT NULL,
                        content TEXT NOT NULL, updated TEXT NOT NULL);
                    CREATE TABLE setlists (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
                    CREATE TABLE setlist_songs (setlist_id INTEGER NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
                        position INTEGER NOT NULL, song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                        key TEXT NOT NULL, PRIMARY KEY (setlist_id, position));
                    INSERT INTO songs VALUES (7, 'Old', '', 'G', 'Old' || char(10, 10) || '[Verse 1]' || char(10) || 'la' || char(10), '2026-01-01');
                    INSERT INTO setlists VALUES (1, 'Gig');
                    INSERT INTO setlist_songs VALUES (1, 0, 7, 'A');
                    PRAGMA user_version = 1;
                    """;
                command.ExecuteNonQuery();
            }

            var library = new SongLibrary(path);
            var song = library.LoadSong(7)!;
            Assert.Equal("Old", song.Title);
            Assert.Empty(song.Notes);
            Assert.Equal([7L], library.LoadSetlist(1)!.Songs);

            song.Notes.Add(new SongNote("new note", 3, 4));
            library.UpdateSong(7, song);
            Assert.Equal("new note", Assert.Single(library.LoadSong(7)!.Notes).Text);
        }
    }
}
