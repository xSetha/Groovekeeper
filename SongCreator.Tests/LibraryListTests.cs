using System.IO;
using SongCreator.IO;

namespace SongCreator.Tests
{
    public class LibraryListTests : IDisposable
    {
        private readonly string _dir = Directory.CreateTempSubdirectory("SongCreatorTests").FullName;

        public void Dispose() => Directory.Delete(_dir, recursive: true);

        [Fact]
        public void StartsWithTheExistingLibraryAsMyLibrary()
        {
            var list = LibraryList.Load(_dir);

            var only = Assert.Single(list.Libraries);
            Assert.Equal(LibraryList.DefaultName, only.Name);
            Assert.Equal(Path.Combine(_dir, "library.db"), list.PathOf(only));
            Assert.Same(only, list.Current);
        }

        [Fact]
        public void KeepsLibrariesAndTheOpenOneBetweenRuns()
        {
            var list = LibraryList.Load(_dir);
            var band = list.Add("  Band ");
            list.SetCurrent(band.Id);
            list.Save();

            var again = LibraryList.Load(_dir);

            Assert.Equal([LibraryList.DefaultName, "Band"], again.Libraries.Select(l => l.Name));
            Assert.Equal(band.Id, again.Current.Id);
            Assert.Equal(Path.Combine(_dir, "libraries", band.Id + ".db"), again.PathOf(again.Current));
        }

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("my LIBRARY")]
        public void RefusesAnEmptyOrTakenName(string name)
        {
            var list = LibraryList.Load(_dir);

            Assert.NotNull(list.NameProblem(name));
            Assert.Throws<ArgumentException>(() => list.Add(name));
        }

        [Fact]
        public void RefusesANameOverTheLimit()
        {
            Assert.NotNull(LibraryList.Load(_dir).NameProblem(new string('a', LibraryList.MaxNameLength + 1)));
        }

        [Fact]
        public void ALibraryMayBeRenamedToItsOwnNameWithOtherCase()
        {
            var list = LibraryList.Load(_dir);

            list.Rename(list.Current.Id, "MY LIBRARY");

            Assert.Equal("MY LIBRARY", list.Current.Name);
        }

        [Fact]
        public void RenamingToAnotherLibrarysNameIsRefused()
        {
            var list = LibraryList.Load(_dir);
            var band = list.Add("Band");

            Assert.Throws<ArgumentException>(() => list.Rename(band.Id, "my library"));
        }

        [Theory]
        [InlineData("not json")]
        [InlineData("{\"Current\":\"a\",\"Libraries\":[{\"Id\":\"a\",\"Name\":\"A\",\"File\":\"a\\u0000.db\"}]}")]
        [InlineData("{\"Current\":\"x\",\"Libraries\":[]}")]
        [InlineData("{\"Current\":\"a\",\"Libraries\":[{\"Id\":\"a\",\"Name\":\"A\",\"File\":\"..\\\\..\\\\elsewhere.db\"}]}")]
        [InlineData("{\"Current\":\"a\",\"Libraries\":[{\"Id\":\"a\",\"Name\":\"A\",\"File\":\"C:\\\\other.db\"}]}")]
        [InlineData("{\"Current\":\"a\",\"Libraries\":[{\"Id\":\"a\",\"Name\":\"A\",\"File\":\"a.db\"},{\"Id\":\"a\",\"Name\":\"B\",\"File\":\"b.db\"}]}")]
        public void ABrokenOrUnsafeFileFallsBackToMyLibrary(string json)
        {
            File.WriteAllText(Path.Combine(_dir, "libraries.json"), json);

            var list = LibraryList.Load(_dir);

            Assert.Equal([LibraryList.DefaultName], list.Libraries.Select(l => l.Name));
        }

        [Fact]
        public void AnUnknownOpenLibraryFallsBackToTheFirst()
        {
            File.WriteAllText(Path.Combine(_dir, "libraries.json"),
                "{\"Current\":\"gone\",\"Libraries\":[{\"Id\":\"a\",\"Name\":\"A\",\"File\":\"a.db\"}]}");

            Assert.Equal("a", LibraryList.Load(_dir).Current.Id);
        }

        [Fact]
        public void TheOpenLibraryAndTheLastOneCantBeRemoved()
        {
            var list = LibraryList.Load(_dir);
            Assert.Throws<InvalidOperationException>(() => list.Remove(list.Current.Id));

            var band = list.Add("Band");
            Assert.Throws<InvalidOperationException>(() => list.Remove(list.Current.Id));
            Assert.Equal(band, list.Remove(band.Id));
        }

        [Fact]
        public void DiscardingSendsOnlyAnExistingFileAway()
        {
            var list = LibraryList.Load(_dir);
            var discarded = new List<string>();
            list.DeleteFile = discarded.Add;
            var band = list.Add("Band");

            list.Discard(band);   // never opened: no file
            Directory.CreateDirectory(Path.GetDirectoryName(list.PathOf(band))!);
            File.WriteAllText(list.PathOf(band), "");
            list.Discard(band);

            Assert.Equal([list.PathOf(band)], discarded);
        }
    }
}
