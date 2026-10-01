using System.IO;
using SongCreator.Services;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class MainViewModelTests : IDisposable
    {
        private readonly FakeDialogService _dialogs = new();
        private readonly MainViewModel _vm;
        private readonly string _dir = Directory.CreateTempSubdirectory("SongCreatorTests").FullName;

        public MainViewModelTests()
        {
            _vm = new MainViewModel(_dialogs);
        }

        public void Dispose() => Directory.Delete(_dir, recursive: true);

        private string WriteSong(string name, string text)
        {
            string path = Path.Combine(_dir, name);
            File.WriteAllText(path, text);
            return path;
        }

        [Fact]
        public void NewSongOpensAndActivatesATemplate()
        {
            bool focusedTitle = false;
            _vm.FocusTitleRequested += (_, _) => focusedTitle = true;

            _vm.NewSongCommand.Execute(null);

            var document = Assert.Single(_vm.Documents);
            Assert.Same(document, _vm.ActiveDocument);
            Assert.True(_vm.HasDocuments);
            Assert.Equal(6, document.Song.Sections.Count);
            Assert.True(focusedTitle);
        }

        [Fact]
        public void ClosingAnUntouchedNewSongDoesNotAsk()
        {
            _vm.NewSong();
            Assert.True(_vm.Close(_vm.ActiveDocument!));
            Assert.Empty(_dialogs.AskedToSave);
            Assert.False(_vm.HasDocuments);
            Assert.Null(_vm.ActiveDocument);
        }

        [Fact]
        public void CancelKeepsTheSongOpen()
        {
            _vm.NewSong();
            _vm.ActiveDocument!.Song.Title = "Draft";
            _dialogs.SaveAnswer = SaveChoice.Cancel;

            Assert.False(_vm.Close(_vm.ActiveDocument));
            Assert.Equal(["Draft"], _dialogs.AskedToSave);
            Assert.Single(_vm.Documents);
        }

        [Fact]
        public void DontSaveClosesWithoutWriting()
        {
            _vm.NewSong();
            _vm.ActiveDocument!.Song.Title = "Draft";
            _dialogs.SaveAnswer = SaveChoice.DontSave;

            Assert.True(_vm.Close(_vm.ActiveDocument));
            Assert.Empty(_vm.Documents);
            Assert.Empty(Directory.GetFiles(_dir));
        }

        [Fact]
        public void SaveWritesTheFileThenCloses()
        {
            _vm.NewSong();
            _vm.ActiveDocument!.Song.Title = "Draft";
            _dialogs.SaveAnswer = SaveChoice.Save;
            _dialogs.SavePath = Path.Combine(_dir, "draft.txt");

            Assert.True(_vm.Close(_vm.ActiveDocument));
            Assert.Empty(_vm.Documents);
            Assert.StartsWith("Draft", File.ReadAllText(_dialogs.SavePath));
        }

        [Fact]
        public void CancellingTheSaveDialogKeepsTheSongOpen()
        {
            _vm.NewSong();
            _vm.ActiveDocument!.Song.Title = "Draft";
            _dialogs.SaveAnswer = SaveChoice.Save;
            _dialogs.SavePath = null;

            Assert.False(_vm.Close(_vm.ActiveDocument));
            Assert.Single(_vm.Documents);
        }

        [Fact]
        public void ClosingActivatesTheNeighbouringTab()
        {
            _vm.NewSong();
            _vm.NewSong();
            _vm.NewSong();
            var middle = _vm.Documents[1];

            _vm.Close(middle);

            Assert.Same(_vm.Documents[1], _vm.ActiveDocument);
        }

        [Fact]
        public void OpenReadsFilesAndClosesThemQuietlyWhenUnchanged()
        {
            string path = WriteSong("song.txt", "My Song\r\n\r\n[Verse 1]\r\nAm\r\nHello\r\n");
            _dialogs.FilesToOpen = [path];

            _vm.OpenSongCommand.Execute(null);

            var document = Assert.Single(_vm.Documents);
            Assert.Equal("My Song", document.Song.Title);
            Assert.Equal(path, document.FilePath);
            Assert.False(document.HasUnsavedChanges);

            Assert.True(_vm.Close(document));
            Assert.Empty(_dialogs.AskedToSave);
        }

        [Fact]
        public void OpeningAnOpenFileSwitchesToItsTab()
        {
            string path = WriteSong("song.txt", "My Song\r\n");
            _vm.Open([path]);
            _vm.NewSong();

            _vm.Open([path]);

            Assert.Equal(2, _vm.Documents.Count);
            Assert.Equal(path, _vm.ActiveDocument!.FilePath);
        }

        [Fact]
        public void UntitledFileTakesItsNameFromTheFile()
        {
            string path = WriteSong("Hallelujah.txt", "[Verse 1]\r\nI heard there was a secret chord\r\n");
            _vm.Open([path]);
            Assert.Equal("Hallelujah", _vm.ActiveDocument!.Song.Title);
        }

        [Fact]
        public void MissingFileShowsAnError()
        {
            _vm.Open([Path.Combine(_dir, "missing.txt")]);
            Assert.Empty(_vm.Documents);
            Assert.Single(_dialogs.Errors);
        }

        [Fact]
        public void CloseAllStopsAtCancel()
        {
            _vm.NewSong();
            _vm.NewSong();
            _vm.Documents[1].Song.Title = "Keep me";
            _dialogs.SaveAnswer = SaveChoice.Cancel;

            Assert.False(_vm.CloseAll());
            Assert.Single(_vm.Documents);
        }

        // ---- Save and Save As ----

        private SongDocumentViewModel OpenSong(string name = "song.txt")
        {
            _vm.Open([WriteSong(name, "Old title\r\n\r\n[Verse 1]\r\nla la\r\n")]);
            return _vm.ActiveDocument!;
        }

        [Fact]
        public void SaveWritesASongToItsOwnFileWithoutAsking()
        {
            var document = OpenSong();
            document.Song.Title = "New title";

            _vm.SaveCommand.Execute(null);

            Assert.StartsWith("New title", File.ReadAllText(document.FilePath!));
            Assert.Empty(_dialogs.AskedForSavePath);
            Assert.False(document.HasUnsavedChanges);
        }

        [Fact]
        public void SavingANewSongAsksWhereOnlyTheFirstTime()
        {
            _vm.NewSong();
            var document = _vm.ActiveDocument!;
            document.Song.Title = "Draft";
            _dialogs.SavePath = Path.Combine(_dir, "draft.txt");

            _vm.SaveCommand.Execute(null);
            document.Song.Title = "Draft 2";
            _vm.SaveCommand.Execute(null);

            Assert.Equal(["Draft"], _dialogs.AskedForSavePath);   // suggested from the title
            Assert.Equal(_dialogs.SavePath, document.FilePath);
            Assert.StartsWith("Draft 2", File.ReadAllText(_dialogs.SavePath));
        }

        [Fact]
        public void SaveAsWritesANewFileAndKeepsTheOldOne()
        {
            var document = OpenSong();
            string original = document.FilePath!;
            document.Song.Title = "Copy";
            _dialogs.SavePath = Path.Combine(_dir, "copy.txt");

            _vm.SaveAsCommand.Execute(null);

            Assert.Equal(["song.txt"], _dialogs.AskedForSavePath);
            Assert.Equal(_dialogs.SavePath, document.FilePath);
            Assert.StartsWith("Copy", File.ReadAllText(_dialogs.SavePath));
            Assert.StartsWith("Old title", File.ReadAllText(original));
        }

        [Fact]
        public void CancellingSaveAsChangesNothing()
        {
            var document = OpenSong();
            document.Song.Title = "Changed";
            _dialogs.SavePath = null;

            Assert.False(_vm.SaveAs(document));
            Assert.EndsWith("song.txt", document.FilePath);
            Assert.True(document.HasUnsavedChanges);
        }

        [Fact]
        public void ClosingASongWithAFileSavesItThere()
        {
            var document = OpenSong();
            document.Song.Title = "Closed";
            _dialogs.SaveAnswer = SaveChoice.Save;

            Assert.True(_vm.Close(document));
            Assert.StartsWith("Closed", File.ReadAllText(document.FilePath!));
            Assert.Empty(_dialogs.AskedForSavePath);
        }

        [Fact]
        public void AFailedSaveIsReported()
        {
            var document = OpenSong();
            document.Song.Title = "Changed";
            File.SetAttributes(document.FilePath!, FileAttributes.ReadOnly);
            try
            {
                Assert.False(_vm.Save(document));
                Assert.Contains("song.txt", Assert.Single(_dialogs.Errors));
                Assert.True(document.HasUnsavedChanges);
            }
            finally
            {
                File.SetAttributes(document.FilePath!, FileAttributes.Normal);
            }
        }

        [Fact]
        public void SaveWithNoSongOpenDoesNothing()
        {
            _vm.SaveCommand.Execute(null);
            _vm.SaveAsCommand.Execute(null);
            Assert.Empty(_dialogs.AskedForSavePath);
        }
    }
}
