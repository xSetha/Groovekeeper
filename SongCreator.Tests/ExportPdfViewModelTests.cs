using System.IO;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class ExportPdfViewModelTests : IDisposable
    {
        private readonly FakeDialogService _dialogs = new();
        private readonly string _dir = Directory.CreateTempSubdirectory("SongCreatorTests").FullName;
        private readonly string _libraryDir = Directory.CreateTempSubdirectory("SongCreatorTests").FullName;
        private readonly SongLibrary _library;

        public ExportPdfViewModelTests()
        {
            _library = new SongLibrary(Path.Combine(_libraryDir, "library.db"));
        }

        public void Dispose()
        {
            Directory.Delete(_dir, recursive: true);
            Directory.Delete(_libraryDir, recursive: true);
        }

        private static SongDocumentViewModel Document(string title)
        {
            var song = Song.CreateTemplate();
            song.Title = title;
            song.Sections[1].Lines[0].Text = "Hello there";
            song.Sections[1].Lines[0].Chords.Add(new ChordPlacement(6, "Am"));
            return new SongDocumentViewModel(song);
        }

        private ExportPdfViewModel Create(params SongDocumentViewModel[] open) => new(open, _dialogs, _library);

        [Fact]
        public void ListsOpenSongsAndTicksOnlyThoseWithContent()
        {
            var vm = Create(Document("One"), new SongDocumentViewModel(Song.CreateTemplate()));

            Assert.Equal(["One", "Untitled song"], vm.Items.Select(i => i.Song.DisplayTitle));
            Assert.Equal([true, false], vm.Items.Select(i => i.IsSelected));
            Assert.Equal([1, 2], vm.Items.Select(i => i.Position));
            Assert.Equal("1 of 2 songs selected", vm.SelectionSummary);
        }

        [Fact]
        public void SelectionChangesUpdateTheSummary()
        {
            var vm = Create(Document("One"), Document("Two"));
            var changed = new List<string?>();
            vm.PropertyChanged += (_, e) => changed.Add(e.PropertyName);

            vm.Items[0].IsSelected = false;
            vm.Items[1].IsSelected = false;

            Assert.False(vm.CanExport);
            Assert.Equal("0 of 2 songs selected", vm.SelectionSummary);
            Assert.Contains(nameof(ExportPdfViewModel.CanExport), changed);
        }

        [Fact]
        public void MovingReordersAndRenumbers()
        {
            var vm = Create(Document("One"), Document("Two"), Document("Three"));

            vm.MoveUpCommand.Execute(vm.Items[2]);
            vm.MoveUpCommand.Execute(vm.Items[0]);   // already first: no-op
            vm.MoveDownCommand.Execute(vm.Items[2]); // already last: no-op

            Assert.Equal(["One", "Three", "Two"], vm.Items.Select(i => i.Song.Title));
            Assert.Equal([1, 2, 3], vm.Items.Select(i => i.Position));
        }

        [Fact]
        public void AddFilesSkipsDuplicatesAndReportsErrors()
        {
            string path = Path.Combine(_dir, "Hallelujah.txt");
            File.WriteAllText(path, "[Verse 1]\r\nI heard there was a secret chord\r\n");
            var vm = Create();

            vm.AddFiles([path, path, Path.Combine(_dir, "missing.txt")]);

            var item = Assert.Single(vm.Items);
            Assert.Equal("Hallelujah", item.Song.Title);
            Assert.Equal("Hallelujah.txt", item.Source);
            Assert.Single(_dialogs.ErrorNotifications);
            Assert.False(vm.IsEmpty);
        }

        [Fact]
        public void ExportWritesAPdfOpensItAndCloses()
        {
            var vm = Create(Document("One"), Document("Two"));
            _dialogs.PdfPath = Path.Combine(_dir, "book.pdf");
            bool exported = false;
            vm.Exported += (_, _) => exported = true;

            vm.ExportCommand.Execute(null);

            Assert.True(exported);
            Assert.Equal([_dialogs.PdfPath], _dialogs.Opened);
            Assert.Equal(["Exported book.pdf"], _dialogs.SuccessNotifications);
            Assert.StartsWith("%PDF", File.ReadAllText(_dialogs.PdfPath)[..4]);
        }

        [Fact]
        public void CancellingTheSaveDialogExportsNothing()
        {
            var vm = Create(Document("One"));
            _dialogs.PdfPath = null;
            bool exported = false;
            vm.Exported += (_, _) => exported = true;

            vm.Export();

            Assert.False(exported);
            Assert.Empty(Directory.GetFiles(_dir));
        }

        [Fact]
        public void AddsLibrarySongs()
        {
            _library.AddSong(new Song { Title = "From the library", Artist = "Me" });
            var vm = Create();

            vm.AddFromLibrary(_library.ListSongs());

            var item = Assert.Single(vm.Items);
            Assert.Equal("From the library", item.Song.Title);
            Assert.Equal("Library  ·  Me", item.Details);
        }

        [Fact]
        public void MainWindowCommandOpensTheExportWindowWithOpenSongs()
        {
            var main = new MainViewModel(_dialogs, _library);
            main.NewSong();

            main.ExportPdfCommand.Execute(null);

            Assert.Single(_dialogs.ShownExport!.Items);
        }
    }
}
