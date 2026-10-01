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
    /// The song library list: every library song, filtered by a search over title, artist and key.
    /// </summary>
    public class LibraryViewModel : ObservableObject
    {
        private readonly IDialogService _dialogs;
        private IReadOnlyList<SongSummary> _all = [];
        private string _searchText = "";

        public LibraryViewModel(SongLibrary library, IDialogService dialogs)
        {
            Library = library;
            _dialogs = dialogs;
            // A right-click on an empty part of the list sends no song.
            OpenCommand = new RelayCommand<SongSummary?>(song => { if (song != null) OpenRequested?.Invoke(this, song); });
            DeleteCommand = new RelayCommand<SongSummary?>(song => { if (song != null) Delete(song); });
            // The import reports its own errors, so the task needn't be awaited here.
            ImportCommand = new RelayCommand(() => _ = ImportSongsAsync(_dialogs.PickSongsToOpen()));
            Refresh();
        }

        public SongLibrary Library { get; }

        /// <summary>The songs matching <see cref="SearchText"/>, by title.</summary>
        public ObservableCollection<SongSummary> Songs { get; } = new();

        public bool IsEmpty => _all.Count == 0;

        public string SearchText
        {
            get => _searchText;
            set
            {
                if (SetProperty(ref _searchText, value))
                    ApplySearch();
            }
        }

        public ICommand OpenCommand { get; }
        public ICommand DeleteCommand { get; }
        public ICommand ImportCommand { get; }

        /// <summary>Asks the window to open a library song.</summary>
        public event EventHandler<SongSummary>? OpenRequested;

        /// <summary>Raised after a song was deleted from the library, with its id.</summary>
        public event EventHandler<long>? SongDeleted;

        /// <summary>Reloads the list from the library (after a save, import or delete).</summary>
        public void Refresh()
        {
            try
            {
                _all = Library.ListSongs();
            }
            catch (SqliteException ex)
            {
                _all = [];
                _dialogs.ShowError("Library", $"Couldn't read the song library:\n{ex.Message}");
            }
            OnPropertyChanged(nameof(IsEmpty));
            ApplySearch();
        }

        /// <summary>
        /// Adds copies of song files to the library; the files are not changed. Files that can't be read are
        /// reported and skipped.
        /// </summary>
        public async Task ImportSongsAsync(IReadOnlyList<string> paths)
        {
            if (paths.Count == 0)
                return;

            var (songs, errors) = await Task.Run(() =>
            {
                var loaded = new List<Song>();
                var failed = new List<string>();
                foreach (string path in paths)
                {
                    try
                    {
                        loaded.Add(SongFile.Load(path));
                    }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                    {
                        failed.Add($"{Path.GetFileName(path)}: {ex.Message}");
                    }
                }
                return (loaded, failed);
            });

            if (errors.Count > 0)
                _dialogs.ShowError("Import songs", $"Couldn't read these files:\n{string.Join("\n", errors)}");
            try
            {
                Library.AddSongs(songs);
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Import songs", $"Couldn't add the songs to the library:\n{ex.Message}");
            }
            Refresh();
        }

        public void Delete(SongSummary song)
        {
            try
            {
                int setlists = Library.SetlistCountFor(song.Id);
                string usage = setlists switch
                {
                    0 => "",
                    1 => "\nIt will also be taken out of 1 setlist.",
                    _ => $"\nIt will also be taken out of {setlists} setlists.",
                };
                if (!_dialogs.Confirm("Delete song", $"Delete \"{song.DisplayTitle}\" from the library?{usage}"))
                    return;
                Library.DeleteSong(song.Id);
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Delete song", $"Couldn't delete \"{song.DisplayTitle}\":\n{ex.Message}");
                return;
            }
            Refresh();
            SongDeleted?.Invoke(this, song.Id);
        }

        /// <summary>Title, artist or key containing the search text, ignoring case.</summary>
        public static bool Matches(SongSummary song, string search) =>
            search.Trim().Length == 0 ||
            new[] { song.Title, song.Artist, song.Key }.Any(field => field.Contains(search.Trim(), StringComparison.OrdinalIgnoreCase));

        private void ApplySearch()
        {
            Songs.Clear();
            foreach (var song in _all.Where(song => Matches(song, SearchText)))
                Songs.Add(song);
        }
    }
}
