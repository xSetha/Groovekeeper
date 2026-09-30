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
    }
}
