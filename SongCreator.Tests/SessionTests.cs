using System.IO;
using SongCreator.IO;

namespace SongCreator.Tests
{
    public class SessionTests : IDisposable
    {
        private readonly string _dir = Directory.CreateTempSubdirectory("SongCreatorTests").FullName;

        public void Dispose() => Directory.Delete(_dir, recursive: true);

        [Fact]
        public void RemembersTheOpenSongsInOrderAndTheActiveOne()
        {
            string path = Path.Combine(_dir, "data", "session.json");
            var session = new Session("lib-1", [new SessionSong(7, null), new SessionSong(null, @"C:\songs\Grace.txt")], 1);

            session.Save(path);
            var loaded = Session.Load(path);

            Assert.Equal("lib-1", loaded.Library);
            Assert.Equal(1, loaded.Active);
            Assert.Equal([new SessionSong(7, null), new SessionSong(null, @"C:\songs\Grace.txt")], loaded.Songs);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("not json")]
        [InlineData("{}")]
        [InlineData("null")]
        public void AMissingOrUnreadableFileIsAnEmptySession(string? content)
        {
            string path = Path.Combine(_dir, "session.json");
            if (content != null)
                File.WriteAllText(path, content);

            Assert.Empty(Session.Load(path).Songs);
        }

        [Fact]
        public void ANullWhereASongShouldBeIsLeftOut()
        {
            string path = Path.Combine(_dir, "session.json");
            File.WriteAllText(path, """{ "Library": null, "Songs": [null, { "LibraryId": 3, "FilePath": null }], "Active": 0 }""");

            Assert.Equal([new SessionSong(3, null)], Session.Load(path).Songs);
        }

        [Fact]
        public void FailingToWriteIsNotAnError()
        {
            string blocker = Path.Combine(_dir, "blocker");
            File.WriteAllText(blocker, "");

            new Session(null, [], 0).Save(Path.Combine(blocker, "session.json"));
        }
    }
}
