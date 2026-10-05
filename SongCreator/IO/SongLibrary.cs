using System.IO;
using Microsoft.Data.Sqlite;
using SongCreator.Models;

namespace SongCreator.IO
{
    /// <summary>A library song as the list shows it.</summary>
    public record SongSummary(long Id, string Title, string Artist, string Key)
    {
        public string DisplayTitle => Title.Length > 0 ? Title : Song.UntitledTitle;

        /// <summary>Artist and key, e.g. "John Newton  ·  G"; empty when neither is set.</summary>
        public string Details => string.Join("  ·  ", new[] { Artist, Key }.Where(part => part.Length > 0));
    }

    /// <summary>A library setlist: its songs' ids, in playing order.</summary>
    public record LibrarySetlist(long Id, string Name, IReadOnlyList<long> Songs);

    /// <summary>
    /// The song library: songs and setlists in a SQLite database. Each song is stored as its .txt text
    /// (<see cref="SongTextWriter"/>), with the title, artist and key copied into columns for the list, and its notes
    /// in a table of their own (they aren't part of the text).
    /// Every method throws <see cref="SqliteException"/> if the database can't be read or written.
    /// </summary>
    public class SongLibrary
    {
        // 1: songs and setlists. 2: notes floating over a song.
        private const int SchemaVersion = 2;

        private readonly string _connectionString;

        public SongLibrary(string path)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
            // No pooling: the file is released as soon as a call is done, so it can be backed up, moved or deleted.
            _connectionString = new SqliteConnectionStringBuilder { DataSource = path, Pooling = false }.ToString();
            CreateSchema();
        }

        public static string DefaultPath { get; } = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SongCreator", "library.db");

        public IReadOnlyList<SongSummary> ListSongs()
        {
            using var connection = Open();
            var songs = new List<SongSummary>();
            using var command = Command(connection, "SELECT id, title, artist, key FROM songs ORDER BY title COLLATE NOCASE, id");
            using var reader = command.ExecuteReader();
            while (reader.Read())
                songs.Add(new SongSummary(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3)));
            return songs;
        }

        /// <summary>Returns the song with its notes, or null if it isn't in the library (any more).</summary>
        public Song? LoadSong(long id)
        {
            using var connection = Open();
            if (Scalar(connection, "SELECT content FROM songs WHERE id = $id", ("$id", id)) is not string text)
                return null;
            var song = SongTextReader.Parse(text);
            using var command = Command(connection,
                "SELECT text, left_column, top, print_row FROM notes WHERE song_id = $id ORDER BY position", ("$id", id));
            using var reader = command.ExecuteReader();
            while (reader.Read())
                song.Notes.Add(new SongNote(reader.GetString(0), reader.GetDouble(1), reader.GetDouble(2), reader.GetDouble(3)));
            return song;
        }

        public long AddSong(Song song)
        {
            using var connection = Open();
            return AddSong(connection, song);
        }

        /// <summary>Adds several songs in one transaction and returns their ids.</summary>
        public IReadOnlyList<long> AddSongs(IEnumerable<Song> songs)
        {
            using var connection = Open();
            using var transaction = connection.BeginTransaction();
            var ids = songs.Select(song => AddSong(connection, song)).ToList();
            transaction.Commit();
            return ids;
        }

        public void UpdateSong(long id, Song song)
        {
            using var connection = Open();
            using var transaction = connection.BeginTransaction();
            Execute(connection,
                "UPDATE songs SET title = $title, artist = $artist, key = $key, content = $content, updated = $updated WHERE id = $id",
                [("$id", id), .. SongValues(song)]);
            SaveNotes(connection, id, song);
            transaction.Commit();
        }

        /// <summary>Deletes the song; it is also taken out of every setlist.</summary>
        public void DeleteSong(long id)
        {
            using var connection = Open();
            Execute(connection, "DELETE FROM songs WHERE id = $id", ("$id", id));
        }

        /// <summary>How many setlists contain the song.</summary>
        public int SetlistCountFor(long songId)
        {
            using var connection = Open();
            return Convert.ToInt32(Scalar(connection,
                "SELECT COUNT(DISTINCT setlist_id) FROM setlist_songs WHERE song_id = $id", ("$id", songId)));
        }

        /// <summary>Every setlist's id and name (without songs), by name.</summary>
        public IReadOnlyList<LibrarySetlist> ListSetlists()
        {
            using var connection = Open();
            var setlists = new List<LibrarySetlist>();
            using var command = Command(connection, "SELECT id, name FROM setlists ORDER BY name COLLATE NOCASE, id");
            using var reader = command.ExecuteReader();
            while (reader.Read())
                setlists.Add(new LibrarySetlist(reader.GetInt64(0), reader.GetString(1), []));
            return setlists;
        }

        /// <summary>Returns the setlist with its songs in order, or null if it isn't in the library.</summary>
        public LibrarySetlist? LoadSetlist(long id)
        {
            using var connection = Open();
            if (Scalar(connection, "SELECT name FROM setlists WHERE id = $id", ("$id", id)) is not string name)
                return null;

            var songs = new List<long>();
            using var command = Command(connection,
                "SELECT song_id FROM setlist_songs WHERE setlist_id = $id ORDER BY position", ("$id", id));
            using var reader = command.ExecuteReader();
            while (reader.Read())
                songs.Add(reader.GetInt64(0));
            return new LibrarySetlist(id, name, songs);
        }

        /// <summary>Saves a setlist, as a new one when <paramref name="id"/> is null. Returns its id.</summary>
        public long SaveSetlist(long? id, string name, IReadOnlyList<long> songIds)
        {
            using var connection = Open();
            using var transaction = connection.BeginTransaction();
            long setlistId;
            if (id is long existing)
            {
                setlistId = existing;
                Execute(connection, "UPDATE setlists SET name = $name WHERE id = $id", ("$id", setlistId), ("$name", name));
                Execute(connection, "DELETE FROM setlist_songs WHERE setlist_id = $id", ("$id", setlistId));
            }
            else
            {
                setlistId = (long)Scalar(connection, "INSERT INTO setlists (name) VALUES ($name) RETURNING id", ("$name", name))!;
            }

            // The key column is from when setlists had a key for each song; it's kept so older libraries still open.
            for (int i = 0; i < songIds.Count; i++)
                Execute(connection,
                    "INSERT INTO setlist_songs (setlist_id, position, song_id, key) VALUES ($setlist, $position, $song, '')",
                    ("$setlist", setlistId), ("$position", i), ("$song", songIds[i]));
            transaction.Commit();
            return setlistId;
        }

        public void DeleteSetlist(long id)
        {
            using var connection = Open();
            Execute(connection, "DELETE FROM setlists WHERE id = $id", ("$id", id));
        }

        /// <summary>Writes a copy of the whole library to <paramref name="path"/>, which must not exist yet.</summary>
        public void BackupTo(string path)
        {
            using var connection = Open();
            Execute(connection, "VACUUM INTO $path", ("$path", path));
        }

        private void CreateSchema()
        {
            using var connection = Open();
            int version = Convert.ToInt32(Scalar(connection, "PRAGMA user_version"));
            if (version >= SchemaVersion)
                return;

            using var transaction = connection.BeginTransaction();
            if (version < 1)
                Execute(connection, """
                CREATE TABLE songs (
                    id INTEGER PRIMARY KEY,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    key TEXT NOT NULL,
                    content TEXT NOT NULL,
                    updated TEXT NOT NULL);
                CREATE TABLE setlists (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL);
                CREATE TABLE setlist_songs (
                    setlist_id INTEGER NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
                    position INTEGER NOT NULL,
                    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                    key TEXT NOT NULL,
                    PRIMARY KEY (setlist_id, position));
                CREATE INDEX setlist_songs_song ON setlist_songs(song_id);
                """);
            // Each step upgrades an older library; an existing library keeps its songs and setlists.
            if (version < 2)
                Execute(connection, """
                CREATE TABLE notes (
                    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
                    position INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    left_column REAL NOT NULL,
                    top REAL NOT NULL,
                    print_row REAL NOT NULL,
                    PRIMARY KEY (song_id, position));
                """);
            Execute(connection, $"PRAGMA user_version = {SchemaVersion}");
            transaction.Commit();
        }

        private SqliteConnection Open()
        {
            var connection = new SqliteConnection(_connectionString);
            connection.Open();
            Execute(connection, "PRAGMA foreign_keys = ON");
            return connection;
        }

        private static long AddSong(SqliteConnection connection, Song song)
        {
            long id = (long)Scalar(connection,
                "INSERT INTO songs (title, artist, key, content, updated) VALUES ($title, $artist, $key, $content, $updated) RETURNING id",
                SongValues(song))!;
            SaveNotes(connection, id, song);
            return id;
        }

        private static void SaveNotes(SqliteConnection connection, long songId, Song song)
        {
            Execute(connection, "DELETE FROM notes WHERE song_id = $id", ("$id", songId));
            for (int i = 0; i < song.Notes.Count; i++)
            {
                var note = song.Notes[i];
                Execute(connection,
                    "INSERT INTO notes (song_id, position, text, left_column, top, print_row) VALUES ($song, $position, $text, $column, $top, $row)",
                    ("$song", songId), ("$position", i), ("$text", note.Text), ("$column", note.Column), ("$top", note.Top),
                    ("$row", note.PrintRow));
            }
        }

        private static (string, object)[] SongValues(Song song) =>
        [
            ("$title", song.Title),
            ("$artist", song.Artist),
            ("$key", song.Key),
            ("$content", SongTextWriter.ToText(song)),
            ("$updated", DateTime.UtcNow.ToString("O")),
        ];

        private static int Execute(SqliteConnection connection, string sql, params (string Name, object Value)[] parameters)
        {
            // Every command is disposed: an undisposed one keeps its statement, and with it the file, open.
            using var command = Command(connection, sql, parameters);
            return command.ExecuteNonQuery();
        }

        private static object? Scalar(SqliteConnection connection, string sql, params (string Name, object Value)[] parameters)
        {
            using var command = Command(connection, sql, parameters);
            return command.ExecuteScalar();
        }

        private static SqliteCommand Command(SqliteConnection connection, string sql, params (string Name, object Value)[] parameters)
        {
            var command = connection.CreateCommand();
            command.CommandText = sql;
            foreach (var (name, value) in parameters)
                command.Parameters.AddWithValue(name, value);
            return command;
        }
    }
}
