using System.Collections.ObjectModel;
using System.IO;
using System.Windows.Input;
using Microsoft.Data.Sqlite;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Services;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// The window: which songs are open, which one is active, and creating, opening, saving and closing them.
    /// A song is saved in the library unless it was opened from (or saved as) a file.
    /// </summary>
    public class MainViewModel : ObservableObject
    {
        private readonly IDialogService _dialogs;
        private readonly SongLibrary _library;
        private SongDocumentViewModel? _activeDocument;
        private bool _isLibraryPanelOpen = true;
        private bool _isSetlistsViewActive;

        public MainViewModel(IDialogService dialogs, SongLibrary library)
        {
            _dialogs = dialogs;
            _library = library;
            Library = new LibraryViewModel(library, dialogs);
            Library.OpenRequested += (_, song) => OpenFromLibrary(song.Id);
            Library.ImportFromWebRequested += (_, _) => ImportFromWeb();
            Library.SongDeleted += (_, id) => Documents.FirstOrDefault(d => d.LibraryId == id)?.DetachFromLibrary();
            Documents.CollectionChanged += (_, _) =>
            {
                OnPropertyChanged(nameof(HasDocuments));
                OnPropertyChanged(nameof(IsEditingSong));
            };
            Setlists = new SetlistViewModel(dialogs, Library);
            Setlists.OpenSongRequested += (_, id) => OpenFromLibrary(id);

            NewSongCommand = new RelayCommand(NewSong);
            OpenSongCommand = new RelayCommand(() => Open(_dialogs.PickSongsToOpen()));
            // The song shortcuts do nothing while the Setlists tab hides the editor.
            SaveCommand = new RelayCommand(() => { if (IsEditingSong) Save(ActiveDocument!); });
            SaveAsCommand = new RelayCommand(() => { if (IsEditingSong) SaveAs(ActiveDocument!); });
            CloseSongCommand = new RelayCommand<SongDocumentViewModel>(document => Close(document));
            ExportPdfCommand = new RelayCommand(() => _dialogs.ShowExportPdf(new ExportPdfViewModel(Documents, _dialogs, _library)));
            ShowSongsCommand = new RelayCommand(() => IsSetlistsViewActive = false);
            ShowSetlistsCommand = new RelayCommand(() => IsSetlistsViewActive = true);
            BackupLibraryCommand = new RelayCommand(BackupLibrary);
            ImportFromWebCommand = new RelayCommand(ImportFromWeb);
            ToggleLibraryPanelCommand = new RelayCommand(() => IsLibraryPanelOpen = !IsLibraryPanelOpen);
        }

        public ObservableCollection<SongDocumentViewModel> Documents { get; } = new();

        public SongDocumentViewModel? ActiveDocument
        {
            get => _activeDocument;
            set => SetProperty(ref _activeDocument, value);
        }

        public bool HasDocuments => Documents.Count > 0;

        public LibraryViewModel Library { get; }

        /// <summary>The Setlists tab.</summary>
        public SetlistViewModel Setlists { get; }

        /// <summary>Whether the Setlists tab is shown instead of the songs (the editor or the start page).</summary>
        public bool IsSetlistsViewActive
        {
            get => _isSetlistsViewActive;
            set
            {
                if (!SetProperty(ref _isSetlistsViewActive, value))
                    return;
                OnPropertyChanged(nameof(IsEditingSong));
                // Songs may have been edited, renamed or deleted on the Songs tab.
                if (value)
                    Setlists.Refresh();
            }
        }

        /// <summary>Whether the song editor is shown, with a song in it.</summary>
        public bool IsEditingSong => HasDocuments && !IsSetlistsViewActive;

        /// <summary>Whether the library panel is shown next to the editor.</summary>
        public bool IsLibraryPanelOpen
        {
            get => _isLibraryPanelOpen;
            set => SetProperty(ref _isLibraryPanelOpen, value);
        }

        /// <summary>Theme picker; set by the view (it needs the running WPF application).</summary>
        public ThemesViewModel? Themes { get; init; }

        public ICommand NewSongCommand { get; }
        public ICommand OpenSongCommand { get; }
        public ICommand SaveCommand { get; }
        public ICommand SaveAsCommand { get; }
        public ICommand CloseSongCommand { get; }
        public ICommand ExportPdfCommand { get; }
        public ICommand ShowSongsCommand { get; }
        public ICommand ShowSetlistsCommand { get; }
        public ICommand BackupLibraryCommand { get; }
        public ICommand ToggleLibraryPanelCommand { get; }
        public ICommand ImportFromWebCommand { get; }

        /// <summary>Asks the view to focus the active song's title.</summary>
        public event EventHandler? FocusTitleRequested;

        /// <summary>Forwards <see cref="SongDocumentViewModel.FocusRequested"/> from every open song.</summary>
        public event EventHandler<FocusRequest>? FocusLineRequested;

        /// <summary>Forwards <see cref="FindReplaceViewModel.MatchFound"/> from every open song.</summary>
        public event EventHandler<FindMatch>? FindMatchFound;

        public void NewSong()
        {
            Add(new SongDocumentViewModel(Song.CreateTemplate()));
            FocusTitleRequested?.Invoke(this, EventArgs.Empty);
        }

        public void Open(IEnumerable<string> paths)
        {
            foreach (string path in paths)
            {
                // Already open: just switch to its tab.
                var open = Documents.FirstOrDefault(d => string.Equals(d.FilePath, path, StringComparison.OrdinalIgnoreCase));
                if (open != null)
                {
                    Show(open);
                    continue;
                }

                Song song;
                try
                {
                    song = SongFile.Load(path);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    _dialogs.ShowError("Open song", $"Couldn't open {Path.GetFileName(path)}:\n{ex.Message}");
                    continue;
                }
                Add(new SongDocumentViewModel(song, path));
            }
        }

        /// <summary>Shows the Import from Web window; an imported song opens as a new, unsaved song.</summary>
        public void ImportFromWeb()
        {
            var import = new WebImportViewModel();
            _dialogs.ShowWebImport(import);
            if (import.ImportedSong != null)
                Add(new SongDocumentViewModel(import.ImportedSong));
        }

        /// <summary>Opens a library song, or switches to its tab if it is already open.</summary>
        public void OpenFromLibrary(long id)
        {
            var open = Documents.FirstOrDefault(d => d.LibraryId == id);
            if (open != null)
            {
                Show(open);
                return;
            }

            Song? song;
            try
            {
                song = _library.LoadSong(id);
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Open song", $"Couldn't read the song from the library:\n{ex.Message}");
                return;
            }
            if (song == null)
            {
                _dialogs.ShowError("Open song", "This song is no longer in the library.");
                Library.Refresh();
                return;
            }
            Add(new SongDocumentViewModel(song, libraryId: id));
        }

        /// <summary>
        /// Asks to save a song with unsaved changes, then closes it. Returns false if the user cancelled.
        /// </summary>
        public bool Close(SongDocumentViewModel document)
        {
            if (document.HasUnsavedChanges)
            {
                Show(document);
                switch (_dialogs.AskToSave(document.Song.DisplayTitle))
                {
                    case SaveChoice.Cancel:
                        return false;
                    case SaveChoice.Save when !Save(document):
                        return false;
                }
            }

            int index = Documents.IndexOf(document);
            Documents.Remove(document);
            ActiveDocument = Documents.Count > 0 ? Documents[Math.Min(index, Documents.Count - 1)] : null;
            return true;
        }

        /// <summary>Closes every song (asking to save each); returns false if the user cancelled.</summary>
        public bool CloseAll() => Documents.ToList().All(Close);

        /// <summary>
        /// Saves the song to its file, or to the library if it has no file. Returns false if it failed.
        /// </summary>
        public bool Save(SongDocumentViewModel document) =>
            document.FilePath != null ? WriteTo(document, document.FilePath) : SaveToLibrary(document);

        /// <summary>
        /// Asks for a file and saves the song there. A library song stays in the library and the file is a copy;
        /// any other song moves to the new file. Returns false if cancelled or failed.
        /// </summary>
        public bool SaveAs(SongDocumentViewModel document)
        {
            // A song that isn't in the library moves to the file, which can't hold its notes: say so first.
            bool dropsNotes = document.LibraryId == null && document.Song.Notes.Count > 0;
            if (dropsNotes && !_dialogs.Confirm("Save as file", $"Save “{document.Song.DisplayTitle}” without its notes?",
                    "Notes are kept in the library, not in song files, so the file won't have them.", "Save without notes"))
                return false;

            string suggestedName = document.FilePath != null
                ? Path.GetFileName(document.FilePath)
                : string.Concat(document.Song.DisplayTitle.Split(Path.GetInvalidFileNameChars()));
            string? path = _dialogs.PickSavePath(suggestedName, Path.GetDirectoryName(document.FilePath));
            if (path == null)
                return false;

            var notes = document.Song.Notes.ToList();
            if (dropsNotes)
                document.Song.Notes.Clear();
            if (WriteTo(document, path))
                return true;
            foreach (var note in notes.Where(n => !document.Song.Notes.Contains(n)))
                document.Song.Notes.Add(note);   // the file couldn't be written: the song keeps its notes
            return false;
        }

        /// <summary>
        /// Adds a note to the song at a spot. Notes are kept in the library, so a song opened from a file is saved there
        /// first, after asking (its file stays as it is). Returns the note, or null if the user said no or saving failed.
        /// </summary>
        public SongNote? AddNote(SongDocumentViewModel document, double column, double top)
        {
            if (!document.CanHaveNotes)
            {
                if (!_dialogs.Confirm("Add note", $"Save “{document.Song.DisplayTitle}” in the library to add notes?",
                        "Notes are kept in the library, beside the song. The song file stays as it is.", "Save in library"))
                    return null;
                if (!SaveToLibrary(document))
                    return null;
            }
            return document.AddNote(column, top);
        }

        private bool SaveToLibrary(SongDocumentViewModel document)
        {
            try
            {
                document.SaveTo(_library);
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Save song", $"Couldn't save {document.Song.DisplayTitle} in the library:\n{ex.Message}");
                return false;
            }
            Library.Refresh();
            return true;
        }

        private bool WriteTo(SongDocumentViewModel document, string path)
        {
            try
            {
                if (document.LibraryId != null)
                    document.ExportTo(path);
                else
                    document.SaveTo(path);
                return true;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _dialogs.ShowError("Save song", $"Couldn't save {Path.GetFileName(path)}:\n{ex.Message}");
                return false;
            }
        }

        private void BackupLibrary()
        {
            string? path = _dialogs.PickBackupPath($"Groovekeeper library {DateTime.Now:yyyy-MM-dd}");
            if (path == null)
                return;
            try
            {
                // The save dialog already asked before replacing a file, and a backup can't be written over one.
                File.Delete(path);
                _library.BackupTo(path);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SqliteException)
            {
                _dialogs.ShowError("Back up library", $"Couldn't write {Path.GetFileName(path)}:\n{ex.Message}");
            }
        }

        private void Add(SongDocumentViewModel document)
        {
            document.FocusRequested += (_, request) => FocusLineRequested?.Invoke(this, request);
            document.Find.MatchFound += (_, match) => FindMatchFound?.Invoke(this, match);
            Documents.Add(document);
            Show(document);
        }

        /// <summary>Makes the song the active one, on the Songs tab.</summary>
        private void Show(SongDocumentViewModel document)
        {
            ActiveDocument = document;
            IsSetlistsViewActive = false;
        }
    }
}
