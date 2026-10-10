using System.IO;
using SongCreator.IO;
using SongCreator.Services;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class MainViewModelTests : IDisposable
    {
        private readonly FakeDialogService _dialogs = new();
        private readonly MainViewModel _vm;
        private readonly string _dir = Directory.CreateTempSubdirectory("SongCreatorTests").FullName;
        private readonly SongLibrary _library;

        public MainViewModelTests()
        {
            _library = new SongLibrary(Path.Combine(_dir, "library", "library.db"));
            _vm = new MainViewModel(_dialogs, _library);
        }

        public void Dispose() => Directory.Delete(_dir, recursive: true);

        /// <summary>A window with the first library open and "Band" added; files are deleted for real, not recycled.</summary>
        private (MainViewModel Vm, LibraryList List, LibraryInfo Band) WithTwoLibraries()
        {
            var list = LibraryList.Load(Path.Combine(_dir, "data"));
            list.DeleteFile = File.Delete;
            var band = list.Add("Band");
            var library = new SongLibrary(list.PathOf(list.Current));
            return (new MainViewModel(_dialogs, library, list), list, band);
        }

        [Fact]
        public void SwitchingLibraryShowsItsSongsAndClosesTheOnesOpenFromTheOldOne()
        {
            var (vm, list, band) = WithTwoLibraries();
            vm.NewSong();
            vm.Save(vm.ActiveDocument!);
            string fromFile = WriteSong("file.txt", "Title: From a file\n");
            vm.Open([fromFile]);
            Assert.Single(vm.Library.Songs);

            vm.Library.SwitchCommand.Execute(vm.Library.Options.Single(o => o.Info == band));

            Assert.Equal(band, list.Current);
            Assert.Empty(vm.Library.Songs);
            Assert.True(vm.Library.IsEmpty);
            Assert.Equal("Band", vm.Library.CurrentName);
            Assert.Equal("Groovekeeper — Band", vm.WindowTitle);
            Assert.Equal(fromFile, Assert.Single(vm.Documents).FilePath);   // the library song closed, the file stayed
            Assert.Equal(band.Id, LibraryList.Load(Path.Combine(_dir, "data")).Current.Id);
        }

        [Fact]
        public void CancellingTheSaveQuestionKeepsTheLibraryOpen()
        {
            var (vm, list, band) = WithTwoLibraries();
            vm.NewSong();
            vm.Save(vm.ActiveDocument!);
            vm.ActiveDocument!.Song.Title = "Changed";   // unsaved, and the answer is Cancel

            vm.Library.SwitchCommand.Execute(vm.Library.Options.Single(o => o.Info == band));

            Assert.Equal(LibraryList.DefaultName, list.Current.Name);
            Assert.Single(vm.Library.Songs);
            Assert.Single(vm.Documents);
        }

        [Fact]
        public void TheSetlistsFollowTheLibrary()
        {
            var (vm, _, band) = WithTwoLibraries();
            vm.Setlists.NewCommand.Execute(null);
            Assert.True(vm.Setlists.HasSetlists);

            vm.Library.SwitchCommand.Execute(vm.Library.Options.Single(o => o.Info == band));

            Assert.False(vm.Setlists.HasSetlists);
            Assert.False(vm.Setlists.HasSelection);
        }

        [Fact]
        public void NewLibraryIsCreatedAndOpened()
        {
            var (vm, list, _) = WithTwoLibraries();
            _dialogs.TextAnswers.Enqueue("Church");

            vm.Library.NewLibraryCommand.Execute(null);

            Assert.Equal("Church", list.Current.Name);
            Assert.Equal(3, list.Libraries.Count);
            Assert.Equal("Groovekeeper — Church", vm.WindowTitle);
        }

        [Fact]
        public void DeletingTheOpenLibraryOpensAnotherAndRemovesTheFile()
        {
            var (vm, list, band) = WithTwoLibraries();
            vm.Library.SwitchCommand.Execute(vm.Library.Options.Single(o => o.Info == band));
            string bandFile = list.PathOf(band);
            Assert.True(File.Exists(bandFile));

            vm.Library.DeleteLibraryCommand.Execute(null);

            Assert.Equal([LibraryList.DefaultName], list.Libraries.Select(l => l.Name));
            Assert.Equal(LibraryList.DefaultName, vm.Library.CurrentName);
            Assert.False(File.Exists(bandFile));
            Assert.False(vm.Library.CanDeleteLibrary);
            Assert.Equal("Groovekeeper", vm.WindowTitle);
        }

        [Fact]
        public void DecliningTheDeleteQuestionChangesNothing()
        {
            var (vm, list, _) = WithTwoLibraries();
            _dialogs.ConfirmAnswer = false;

            vm.Library.DeleteLibraryCommand.Execute(null);

            Assert.Equal(2, list.Libraries.Count);
        }

        [Fact]
        public void RenamingTheOpenLibraryUpdatesTheTitle()
        {
            var (vm, list, _) = WithTwoLibraries();
            _dialogs.TextAnswers.Enqueue("Home");

            vm.Library.RenameLibraryCommand.Execute(null);

            Assert.Equal("Home", list.Current.Name);
            Assert.Equal("Groovekeeper — Home", vm.WindowTitle);
        }

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
            Assert.Empty(_library.ListSongs());
        }

        [Fact]
        public void SaveAddsANewSongToTheLibraryThenCloses()
        {
            _vm.NewSong();
            _vm.ActiveDocument!.Song.Title = "Draft";
            _dialogs.SaveAnswer = SaveChoice.Save;

            Assert.True(_vm.Close(_vm.ActiveDocument));
            Assert.Empty(_vm.Documents);
            Assert.Empty(_dialogs.AskedForSavePath);
            Assert.Equal(["Draft"], _library.ListSongs().Select(s => s.Title));
            Assert.Equal(["Saved Draft"], _dialogs.SuccessNotifications);
        }

        [Fact]
        public void AFailedLibrarySaveKeepsTheSongOpen()
        {
            _vm.NewSong();
            _vm.ActiveDocument!.Song.Title = "Draft";
            _dialogs.SaveAnswer = SaveChoice.Save;
            File.Delete(Path.Combine(_dir, "library", "library.db"));   // a fresh, empty database has no song table

            Assert.False(_vm.Close(_vm.ActiveDocument));
            Assert.Single(_vm.Documents);
            Assert.Contains("Draft", Assert.Single(_dialogs.Errors));
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
            Assert.Single(_dialogs.ErrorNotifications);
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
            Assert.Equal(["Saved song.txt"], _dialogs.SuccessNotifications);
        }

        [Fact]
        public void SavingANewSongAddsItToTheLibraryOnce()
        {
            _vm.NewSong();
            var document = _vm.ActiveDocument!;
            document.Song.Title = "Draft";

            _vm.SaveCommand.Execute(null);
            document.Song.Title = "Draft 2";
            _vm.SaveCommand.Execute(null);

            Assert.Empty(_dialogs.AskedForSavePath);
            var saved = Assert.Single(_library.ListSongs());
            Assert.Equal("Draft 2", saved.Title);
            Assert.Equal(saved.Id, document.LibraryId);
            Assert.Null(document.FilePath);
            Assert.False(document.HasUnsavedChanges);
            Assert.Equal(["Draft 2"], _vm.Library.Songs.Select(s => s.Title));   // the list is refreshed
        }

        [Fact]
        public void ShowsWhereEachSongIsSaved()
        {
            _vm.NewSong();
            var document = _vm.ActiveDocument!;
            Assert.Equal(SongHome.New, document.Home);
            Assert.Equal("Not saved yet", document.HomeLabel);

            var changed = new List<string?>();
            document.PropertyChanged += (_, e) => changed.Add(e.PropertyName);
            document.Song.Title = "Draft";
            _vm.SaveCommand.Execute(null);

            Assert.Equal(SongHome.Library, document.Home);
            Assert.Equal("Library", document.HomeLabel);
            Assert.Contains(nameof(SongDocumentViewModel.HomeLabel), changed);   // the toolbar updates

            _vm.Open([WriteSong("song.cho", "{title: From a file}\n")]);
            Assert.Equal(SongHome.File, _vm.ActiveDocument!.Home);
            Assert.Equal("song.cho", _vm.ActiveDocument.HomeLabel);
        }

        [Fact]
        public void ImportFromWebOpensTheSongAsANewTab()
        {
            _dialogs.WebImportAction = import => import.Import("G    C\nHello there", "Hello Chords by Someone");

            _vm.ImportFromWebCommand.Execute(null);

            var document = Assert.Single(_vm.Documents);
            Assert.Equal("Hello", document.Song.Title);
            Assert.Equal(SongHome.New, document.Home);
            Assert.True(document.HasUnsavedChanges);
        }

        [Fact]
        public void CancellingTheWebImportOpensNothing()
        {
            _vm.ImportFromWebCommand.Execute(null);
            Assert.Empty(_vm.Documents);
        }

        [Fact]
        public void OpeningALibrarySongTwiceSwitchesToItsTab()
        {
            long id = _library.AddSong(new Models.Song { Title = "Kept" });
            _vm.Library.Refresh();

            _vm.Library.OpenCommand.Execute(_vm.Library.Songs[0]);
            _vm.NewSong();
            _vm.OpenFromLibrary(id);

            Assert.Equal(2, _vm.Documents.Count);
            Assert.Equal("Kept", _vm.ActiveDocument!.Song.Title);
            Assert.Equal(id, _vm.ActiveDocument.LibraryId);
            Assert.False(_vm.ActiveDocument.HasUnsavedChanges);
        }

        [Fact]
        public void SaveAsFileFromALibrarySongWritesACopy()
        {
            _vm.NewSong();
            var document = _vm.ActiveDocument!;
            document.Song.Title = "Library song";
            _vm.SaveCommand.Execute(null);
            _dialogs.SavePath = Path.Combine(_dir, "copy.cho");

            _vm.SaveAsCommand.Execute(null);

            Assert.StartsWith("{title: Library song}", File.ReadAllText(_dialogs.SavePath));
            Assert.NotNull(document.LibraryId);
            Assert.Null(document.FilePath);
        }

        [Fact]
        public void SaveAsFileFromANewSongMakesItAFileSong()
        {
            _vm.NewSong();
            var document = _vm.ActiveDocument!;
            document.Song.Title = "Draft";
            _dialogs.SavePath = Path.Combine(_dir, "draft.txt");

            _vm.SaveAsCommand.Execute(null);
            document.Song.Title = "Draft 2";
            _vm.SaveCommand.Execute(null);

            Assert.Equal(["Draft"], _dialogs.AskedForSavePath);   // suggested from the title
            Assert.StartsWith("Draft 2", File.ReadAllText(_dialogs.SavePath));
            Assert.Empty(_library.ListSongs());
        }

        [Fact]
        public void DeletingAnOpenLibrarySongKeepsItsTabAsUnsaved()
        {
            _vm.NewSong();
            var document = _vm.ActiveDocument!;
            document.Song.Title = "Doomed";
            _vm.SaveCommand.Execute(null);

            _vm.Library.DeleteCommand.Execute(_vm.Library.Songs[0]);

            Assert.Empty(_library.ListSongs());
            Assert.Null(document.LibraryId);
            Assert.True(document.HasUnsavedChanges);
        }

        [Fact]
        public void BacksUpTheLibrary()
        {
            _library.AddSong(new Models.Song { Title = "Safe" });
            _dialogs.BackupPath = Path.Combine(_dir, "backup.db");
            File.WriteAllText(_dialogs.BackupPath, "an older backup the user chose to replace");

            _vm.BackupLibraryCommand.Execute(null);

            Assert.Empty(_dialogs.ErrorNotifications);
            Assert.Equal(["Backed up the library to backup.db"], _dialogs.SuccessNotifications);
            Assert.Equal("Safe", Assert.Single(new SongLibrary(_dialogs.BackupPath).ListSongs()).Title);
        }

        [Fact]
        public void OpensAChordProSongAndSavesItBackAsChordPro()
        {
            string path = WriteSong("song.cho", "{title: Old title}\n{start_of_verse}\n[G]Hello\n{end_of_verse}\n");
            _vm.Open([path]);
            var document = _vm.ActiveDocument!;
            Assert.Equal("Old title", document.Song.Title);
            Assert.False(document.HasUnsavedChanges);

            document.Song.Title = "New title";
            _vm.SaveCommand.Execute(null);

            Assert.StartsWith("{title: New title}", File.ReadAllText(path));
            Assert.Contains("[G]Hello", File.ReadAllText(path));
            Assert.False(document.HasUnsavedChanges);
        }

        [Fact]
        public void SaveAsTextConvertsAChordProSong()
        {
            _vm.Open([WriteSong("song.cho", "{title: Song}\n[G]Hello\n")]);
            var document = _vm.ActiveDocument!;
            _dialogs.SavePath = Path.Combine(_dir, "song.txt");

            _vm.SaveAsCommand.Execute(null);

            Assert.Equal(["song.cho"], _dialogs.AskedForSavePath);
            Assert.Equal("Song\r\n\r\n[Verse 1]\r\nG\r\nHello\r\n", File.ReadAllText(_dialogs.SavePath));
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

        // ---- Notes ----

        [Fact]
        public void ANoteIsSavedWithALibrarySongAndMarksItChanged()
        {
            _vm.NewSongCommand.Execute(null);
            var document = _vm.ActiveDocument!;
            document.Song.Title = "Noted";
            _vm.SaveCommand.Execute(null);
            Assert.False(document.HasUnsavedChanges);

            var note = _vm.AddNote(document, 12, 40)!;
            note.Text = "build up";
            Assert.True(document.HasUnsavedChanges);

            _vm.SaveCommand.Execute(null);
            Assert.False(document.HasUnsavedChanges);
            var saved = _library.LoadSong(document.LibraryId!.Value)!;
            Assert.Equal(("build up", 12.0, 40.0), (saved.Notes[0].Text, saved.Notes[0].Column, saved.Notes[0].Top));

            note.Top = 80;   // moved
            Assert.True(document.HasUnsavedChanges);
        }

        [Fact]
        public void AFileSongIsSavedInTheLibraryBeforeItGetsANote()
        {
            string path = WriteSong("song.txt", "From a file\n\n[Verse 1]\nla\n");
            _dialogs.FilesToOpen = [path];
            _vm.OpenSongCommand.Execute(null);
            var document = _vm.ActiveDocument!;
            Assert.False(document.CanHaveNotes);

            _dialogs.ConfirmAnswer = false;
            Assert.Null(_vm.AddNote(document, 1, 2));
            Assert.Empty(document.Song.Notes);
            Assert.Equal(SongHome.File, document.Home);

            _dialogs.ConfirmAnswer = true;
            Assert.NotNull(_vm.AddNote(document, 1, 2));
            Assert.Equal(SongHome.Library, document.Home);
            Assert.Single(document.Song.Notes);
            Assert.Equal("From a file\n\n[Verse 1]\nla\n", File.ReadAllText(path));   // the file stays as it is
        }

        [Fact]
        public void SavingASongWithNotesAsAFileAsksFirst()
        {
            _vm.NewSongCommand.Execute(null);
            var document = _vm.ActiveDocument!;
            document.Song.Title = "Draft";
            _vm.AddNote(document, 0, 0)!.Text = "hey";
            _dialogs.SavePath = Path.Combine(_dir, "draft.txt");

            _dialogs.ConfirmAnswer = false;
            Assert.False(_vm.SaveAs(document));
            Assert.Single(document.Song.Notes);
            Assert.False(File.Exists(_dialogs.SavePath));

            _dialogs.ConfirmAnswer = true;
            Assert.True(_vm.SaveAs(document));
            Assert.Empty(document.Song.Notes);
            Assert.DoesNotContain("hey", File.ReadAllText(_dialogs.SavePath));
            Assert.False(document.HasUnsavedChanges);
        }

        [Fact]
        public void SavingALibrarySongAsAFileKeepsItsNotesInTheLibrary()
        {
            _vm.NewSongCommand.Execute(null);
            var document = _vm.ActiveDocument!;
            document.Song.Title = "Kept";
            _vm.AddNote(document, 0, 0)!.Text = "hey";
            _vm.SaveCommand.Execute(null);
            _dialogs.SavePath = Path.Combine(_dir, "copy.txt");
            int asked = _dialogs.Confirmations.Count;

            Assert.True(_vm.SaveAs(document));

            Assert.Equal(asked, _dialogs.Confirmations.Count);   // nothing to ask: the library keeps the notes
            Assert.Single(document.Song.Notes);
            Assert.Single(_library.LoadSong(document.LibraryId!.Value)!.Notes);
        }
    }
}
