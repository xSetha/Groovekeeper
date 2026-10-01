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

        public void Dispose() => Directory.Delete(_dir, recursive: true);

        private static string Sample(string name) => Path.Combine(AppContext.BaseDirectory, "samples", name + ".txt");

        /// <summary>A song file in the temp folder, so tests can change or delete it.</summary>
        private string SongFile(string name, string text)
        {
            string path = Path.Combine(_dir, name + ".txt");
            File.WriteAllText(path, text);
            return path;
        }

        [Fact]
        public void AddedSongsStartInTheirOwnKey()
        {
            var setlist = new SetlistViewModel(_dialogs);
            setlist.AddFiles([Sample("Amazing Grace"), Sample("House of the Rising Sun")]);

            Assert.Equal([1, 2], setlist.Items.Select(i => i.Position));
            Assert.Equal(["G", "Am"], setlist.Items.Select(i => i.Key));
            Assert.Equal("original key", setlist.Items[0].KeyNote);
            Assert.True(setlist.IsDirty);
        }

        [Fact]
        public void KeyOptionsAreTheTwelveKeysOfTheSameMode()
        {
            var item = new SetlistItemViewModel(SongTextReader.Load(Sample("House of the Rising Sun")), "x");
            Assert.Equal(["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"], item.KeyOptions);
        }

        [Fact]
        public void ChangingTheKeyTransposesACopyForTheGig()
        {
            var song = SongTextReader.Load(Sample("Amazing Grace"));
            var item = new SetlistItemViewModel(song, "x") { Key = "Bb" };

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
            var item = new SetlistItemViewModel(song, "x") { Key = "Bm" };

            Assert.Equal("Am", item.OriginalKey);
            Assert.Equal("+2 from Am (detected)", item.KeyNote);
            Assert.Equal("Bm", item.SongToPlay().Key);
        }

        [Fact]
        public void ASongWithNoKeyAtAllPlaysAsWritten()
        {
            var song = SongTextReader.Parse("Untitled\n\n[Verse]\nla la");
            var item = new SetlistItemViewModel(song, "x");

            Assert.False(item.HasKey);
            Assert.Same(song, item.SongToPlay());
        }

        [Fact]
        public void SavesAndOpensTheOrderAndKeys()
        {
            string grace = SongFile("Grace", File.ReadAllText(Sample("Amazing Grace")));
            string sun = SongFile("Sun", File.ReadAllText(Sample("House of the Rising Sun")));
            var setlist = new SetlistViewModel(_dialogs) { Name = "Friday gig" };
            setlist.AddFiles([grace, sun]);
            setlist.Items[1].Key = "Em";
            setlist.MoveUpCommand.Execute(setlist.Items[1]);

            _dialogs.SetlistSavePath = Path.Combine(_dir, "friday.setlist");
            Assert.True(setlist.Save());
            Assert.False(setlist.IsDirty);
            Assert.Contains("\"Sun.txt\"", File.ReadAllText(_dialogs.SetlistSavePath));   // stored relative to the setlist

            var reopened = new SetlistViewModel(_dialogs);
            reopened.Load(_dialogs.SetlistSavePath);
            Assert.Equal("Friday gig", reopened.Name);
            Assert.Equal([sun, grace], reopened.Items.Select(i => i.FilePath));
            Assert.Equal(["Em", "G"], reopened.Items.Select(i => i.Key));
            Assert.False(reopened.IsDirty);
        }

        [Fact]
        public void AMissingSongIsReportedAndSkipped()
        {
            string grace = SongFile("Grace", File.ReadAllText(Sample("Amazing Grace")));
            string gone = SongFile("Gone", "Gone\n");
            string path = Path.Combine(_dir, "set.setlist");
            SetlistFile.Save(path, new Setlist("Set", [new SetlistEntry(gone, ""), new SetlistEntry(grace, "A")]));
            File.Delete(gone);

            var setlist = new SetlistViewModel(_dialogs);
            setlist.Load(path);

            Assert.Equal([grace], setlist.Items.Select(i => i.FilePath));
            Assert.Contains("Gone.txt", Assert.Single(_dialogs.Errors));
        }

        [Fact]
        public void ABrokenSetlistFileIsReported()
        {
            string path = Path.Combine(_dir, "broken.setlist");
            File.WriteAllText(path, "not json");

            new SetlistViewModel(_dialogs).Load(path);
            Assert.Contains("broken.setlist", Assert.Single(_dialogs.Errors));
        }

        [Fact]
        public void ClosingAsksToSaveOnlyWhenChanged()
        {
            var setlist = new SetlistViewModel(_dialogs);
            Assert.True(setlist.ConfirmClose());
            Assert.Empty(_dialogs.AskedToSave);

            setlist.AddFiles([Sample("Amazing Grace")]);
            _dialogs.SaveAnswer = SaveChoice.Cancel;
            Assert.False(setlist.ConfirmClose());
            _dialogs.SaveAnswer = SaveChoice.DontSave;
            Assert.True(setlist.ConfirmClose());
        }

        [Fact]
        public void ExportsThePdfInTheChosenKeys()
        {
            var setlist = new SetlistViewModel(_dialogs) { OpenWhenDone = true };
            setlist.AddFiles([Sample("Amazing Grace")]);
            setlist.Items[0].Key = "A";
            _dialogs.PdfPath = Path.Combine(_dir, "set.pdf");

            setlist.Export();

            Assert.True(new FileInfo(_dialogs.PdfPath).Length > 0);
            Assert.Equal([_dialogs.PdfPath], _dialogs.Opened);
        }

        [Fact]
        public void MainWindowOpensTheSetlist()
        {
            new MainViewModel(_dialogs).SetlistCommand.Execute(null);
            Assert.NotNull(_dialogs.ShownSetlist);
        }
    }
}
