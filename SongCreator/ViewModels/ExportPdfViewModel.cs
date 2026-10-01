using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Windows.Input;
using Microsoft.Data.Sqlite;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Services;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// The export window: pick songs (open tabs, library songs or files), order them, and write them as one PDF.
    /// </summary>
    public class ExportPdfViewModel : ObservableObject
    {
        private readonly IDialogService _dialogs;
        private readonly SongLibrary _library;
        private bool _includeTableOfContents = true;
        private bool _openWhenDone = true;
        private bool _romanNumerals;

        public ExportPdfViewModel(IEnumerable<SongDocumentViewModel> openDocuments, IDialogService dialogs, SongLibrary library)
        {
            _dialogs = dialogs;
            _library = library;
            Items.CollectionChanged += (_, e) =>
            {
                foreach (ExportItemViewModel item in e.NewItems ?? Array.Empty<object>())
                    item.PropertyChanged += Item_PropertyChanged;
                for (int i = 0; i < Items.Count; i++)
                    Items[i].Position = i + 1;
                OnPropertyChanged(nameof(IsEmpty));
                OnSelectionChanged();
            };

            // Empty template songs are listed but not ticked.
            foreach (var document in openDocuments)
                Items.Add(new ExportItemViewModel(document.Song, "Open tab", document.FilePath) { IsSelected = document.Song.HasContent });

            AddFilesCommand = new RelayCommand(() => AddFiles(_dialogs.PickSongsToOpen()));
            AddFromLibraryCommand = new RelayCommand(() => AddFromLibrary(_dialogs.PickLibrarySongs(_library)));
            MoveUpCommand = new RelayCommand<ExportItemViewModel>(item => Move(item, -1));
            MoveDownCommand = new RelayCommand<ExportItemViewModel>(item => Move(item, 1));
            RemoveCommand = new RelayCommand<ExportItemViewModel>(item => Items.Remove(item));
            ExportCommand = new RelayCommand(Export);
        }

        public ObservableCollection<ExportItemViewModel> Items { get; } = new();

        public bool IncludeTableOfContents
        {
            get => _includeTableOfContents;
            set => SetProperty(ref _includeTableOfContents, value);
        }

        public bool OpenWhenDone
        {
            get => _openWhenDone;
            set => SetProperty(ref _openWhenDone, value);
        }

        /// <summary>Write chords as Roman numerals in each song's key.</summary>
        public bool RomanNumerals
        {
            get => _romanNumerals;
            set => SetProperty(ref _romanNumerals, value);
        }

        public bool IsEmpty => Items.Count == 0;

        public int SelectedCount => Items.Count(i => i.IsSelected);

        public bool CanExport => SelectedCount > 0;

        public string SelectionSummary => $"{SelectedCount} of {Items.Count} songs selected";

        public ICommand AddFilesCommand { get; }
        public ICommand AddFromLibraryCommand { get; }
        public ICommand MoveUpCommand { get; }
        public ICommand MoveDownCommand { get; }
        public ICommand RemoveCommand { get; }
        public ICommand ExportCommand { get; }

        /// <summary>Raised after the PDF was written, so the view can close.</summary>
        public event EventHandler? Exported;

        public void AddFiles(IEnumerable<string> paths)
        {
            foreach (string path in paths)
            {
                if (Items.Any(i => string.Equals(i.FilePath, path, StringComparison.OrdinalIgnoreCase)))
                    continue;
                try
                {
                    Items.Add(new ExportItemViewModel(SongFile.Load(path), Path.GetFileName(path), path));
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    _dialogs.ShowError("Add song", $"Couldn't open {Path.GetFileName(path)}:\n{ex.Message}");
                }
            }
        }

        public void AddFromLibrary(IEnumerable<SongSummary> songs)
        {
            foreach (var summary in songs)
            {
                Song? song;
                try
                {
                    song = _library.LoadSong(summary.Id);
                }
                catch (SqliteException ex)
                {
                    _dialogs.ShowError("Add song", $"Couldn't read {summary.Title} from the library:\n{ex.Message}");
                    continue;
                }
                if (song != null)
                    Items.Add(new ExportItemViewModel(song, "Library"));
            }
        }

        public void Export()
        {
            List<Song> songs = Items.Where(i => i.IsSelected).Select(i => i.Song).ToList();
            if (songs.Count == 0)
                return;

            string suggestedName = songs.Count == 1
                ? string.Concat(songs[0].DisplayTitle.Split(Path.GetInvalidFileNameChars()))
                : "Songbook";
            string? path = _dialogs.PickPdfSavePath(suggestedName);
            if (path == null)
                return;

            try
            {
                File.WriteAllBytes(path, SongPdfWriter.Create(songs, IncludeTableOfContents, RomanNumerals));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _dialogs.ShowError("Export PDF", $"Couldn't write {Path.GetFileName(path)}:\n{ex.Message}");
                return;
            }

            if (OpenWhenDone)
                _dialogs.OpenWithDefaultApp(path);
            Exported?.Invoke(this, EventArgs.Empty);
        }

        private void Move(ExportItemViewModel item, int offset)
        {
            int from = Items.IndexOf(item);
            int to = from + offset;
            if (to >= 0 && to < Items.Count)
                Items.Move(from, to);
        }

        private void Item_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(ExportItemViewModel.IsSelected))
                OnSelectionChanged();
        }

        private void OnSelectionChanged()
        {
            OnPropertyChanged(nameof(SelectedCount));
            OnPropertyChanged(nameof(CanExport));
            OnPropertyChanged(nameof(SelectionSummary));
        }
    }
}
