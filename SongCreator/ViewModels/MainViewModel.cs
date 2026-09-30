using System.Collections.ObjectModel;
using System.IO;
using System.Windows.Input;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Services;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// The window: which songs are open, which one is active, and creating, opening, saving and closing them.
    /// </summary>
    public class MainViewModel : ObservableObject
    {
        private readonly IDialogService _dialogs;
        private SongDocumentViewModel? _activeDocument;

        public MainViewModel(IDialogService dialogs)
        {
            _dialogs = dialogs;
            Documents.CollectionChanged += (_, _) => OnPropertyChanged(nameof(HasDocuments));

            NewSongCommand = new RelayCommand(NewSong);
            OpenSongCommand = new RelayCommand(() => Open(_dialogs.PickSongsToOpen()));
            CloseSongCommand = new RelayCommand<SongDocumentViewModel>(document => Close(document));
            ExportPdfCommand = new RelayCommand(() => _dialogs.ShowExportPdf(new ExportPdfViewModel(Documents, _dialogs)));
        }

        public ObservableCollection<SongDocumentViewModel> Documents { get; } = new();

        public SongDocumentViewModel? ActiveDocument
        {
            get => _activeDocument;
            set => SetProperty(ref _activeDocument, value);
        }

        public bool HasDocuments => Documents.Count > 0;

        /// <summary>Theme picker; set by the view (it needs the running WPF application).</summary>
        public ThemesViewModel? Themes { get; init; }

        public ICommand NewSongCommand { get; }
        public ICommand OpenSongCommand { get; }
        public ICommand CloseSongCommand { get; }
        public ICommand ExportPdfCommand { get; }

        /// <summary>Asks the view to focus the active song's title.</summary>
        public event EventHandler? FocusTitleRequested;

        /// <summary>Forwards <see cref="SongDocumentViewModel.FocusRequested"/> from every open song.</summary>
        public event EventHandler<FocusRequest>? FocusLineRequested;

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
                    ActiveDocument = open;
                    continue;
                }

                Song song;
                try
                {
                    song = SongTextReader.Load(path);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    _dialogs.ShowError("Open song", $"Couldn't open {Path.GetFileName(path)}:\n{ex.Message}");
                    continue;
                }
                Add(new SongDocumentViewModel(song, path));
            }
        }

        /// <summary>
        /// Asks to save a song with unsaved changes, then closes it. Returns false if the user cancelled.
        /// </summary>
        public bool Close(SongDocumentViewModel document)
        {
            if (document.HasUnsavedChanges)
            {
                ActiveDocument = document;
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

        private bool Save(SongDocumentViewModel document)
        {
            string suggestedName = document.FilePath != null
                ? Path.GetFileName(document.FilePath)
                : string.Concat(document.Song.DisplayTitle.Split(Path.GetInvalidFileNameChars()));
            string? path = _dialogs.PickSavePath(suggestedName, Path.GetDirectoryName(document.FilePath));
            if (path == null)
                return false;

            try
            {
                document.SaveTo(path);
                return true;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _dialogs.ShowError("Save song", $"Couldn't save {Path.GetFileName(path)}:\n{ex.Message}");
                return false;
            }
        }

        private void Add(SongDocumentViewModel document)
        {
            document.FocusRequested += (_, request) => FocusLineRequested?.Invoke(this, request);
            Documents.Add(document);
            ActiveDocument = document;
        }
    }
}
