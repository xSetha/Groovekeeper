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
        // The files a failed import names; the toast says how many more there are.
        private const int MaxListedErrors = 5;

        private readonly IDialogService _dialogs;
        private readonly LibraryList? _libraries;
        private IReadOnlyList<SongSummary> _all = [];
        private string _searchText = "";

        /// <summary>
        /// <paramref name="libraries"/> is the list of named libraries to offer in a switcher; without it (e.g. in the
        /// picker of an export) there is none.
        /// </summary>
        public LibraryViewModel(SongLibrary library, IDialogService dialogs, LibraryList? libraries = null)
        {
            Library = library;
            _dialogs = dialogs;
            _libraries = libraries;
            SwitchCommand = new RelayCommand<LibraryOption?>(option => { if (option is { IsCurrent: false }) SwitchRequested?.Invoke(this, option.Info); });
            NewLibraryCommand = new RelayCommand(NewLibrary);
            RenameLibraryCommand = new RelayCommand(RenameLibrary);
            DeleteLibraryCommand = new RelayCommand(DeleteLibrary);
            // A right-click on an empty part of the list sends no song.
            OpenCommand = new RelayCommand<SongSummary?>(song => { if (song != null) OpenRequested?.Invoke(this, song); });
            DeleteCommand = new RelayCommand<SongSummary?>(song => { if (song != null) Delete(song); });
            // The import reports its own errors, so the task needn't be awaited here.
            ImportCommand = new RelayCommand(() => _ = ImportSongsAsync(_dialogs.PickSongsToOpen()));
            ImportFromWebCommand = new RelayCommand(() => ImportFromWebRequested?.Invoke(this, EventArgs.Empty));
            Refresh();
        }

        public SongLibrary Library { get; }

        /// <summary>Whether there are named libraries to switch between (the switcher is shown).</summary>
        public bool HasSwitcher => _libraries != null;

        /// <summary>Every library, the open one marked.</summary>
        public IReadOnlyList<LibraryOption> Options =>
            _libraries?.Libraries.Select(l => new LibraryOption(l, l.Id == _libraries.Current.Id)).ToList() ?? [];

        public string CurrentName => _libraries?.Current.Name ?? "";

        public bool CanDeleteLibrary => _libraries is { Libraries.Count: > 1 };

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
        public ICommand ImportFromWebCommand { get; }
        public ICommand SwitchCommand { get; }
        public ICommand NewLibraryCommand { get; }
        public ICommand RenameLibraryCommand { get; }
        public ICommand DeleteLibraryCommand { get; }

        /// <summary>
        /// Asks the window to open another library. It may not (the user can cancel saving a song), so the library is
        /// open only once <see cref="LibraryList.Current"/> says so.
        /// </summary>
        public event EventHandler<LibraryInfo>? SwitchRequested;

        /// <summary>Asks the window to open a library song.</summary>
        public event EventHandler<SongSummary>? OpenRequested;

        /// <summary>Asks the window to open the Import from Web window.</summary>
        public event EventHandler? ImportFromWebRequested;

        /// <summary>Raised after a song was deleted from the library, with its id.</summary>
        public event EventHandler<long>? SongDeleted;

        /// <summary>After the window opened another library: shows its name and songs.</summary>
        public void OnSwitched()
        {
            NotifyLibrariesChanged();
            SearchText = "";
            Refresh();
        }

        /// <summary>Writes the list of libraries; tells the user if it couldn't be. Returns false then.</summary>
        public bool SaveLibraries()
        {
            try
            {
                _libraries?.Save();
                return true;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _dialogs.Notify(NotificationKind.Error, "Couldn't remember the libraries", ex.Message);
                return false;
            }
        }

        private void NotifyLibrariesChanged()
        {
            OnPropertyChanged(nameof(Options));
            OnPropertyChanged(nameof(CurrentName));
            OnPropertyChanged(nameof(CanDeleteLibrary));
        }

        private void NewLibrary()
        {
            if (_libraries == null)
                return;
            string? name = _dialogs.AskText("New library", "Name the new library", "", "Create", text => _libraries.NameProblem(text));
            if (name == null)
                return;
            var library = _libraries.Add(name);
            SaveLibraries();
            NotifyLibrariesChanged();
            SwitchRequested?.Invoke(this, library);
        }

        private void RenameLibrary()
        {
            if (_libraries == null)
                return;
            var current = _libraries.Current;
            string? name = _dialogs.AskText("Rename library", $"New name for “{current.Name}”", current.Name, "Rename",
                text => _libraries.NameProblem(text, current.Id));
            if (name == null)
                return;
            _libraries.Rename(current.Id, name);
            SaveLibraries();
            NotifyLibrariesChanged();
        }

        /// <summary>Deletes the open library: its file goes to the Recycle Bin, and another library opens.</summary>
        private void DeleteLibrary()
        {
            if (_libraries == null || !CanDeleteLibrary)
                return;
            var doomed = _libraries.Current;
            if (!_dialogs.Confirm("Delete library", $"Delete the library “{doomed.Name}”?",
                    "Its songs, notes and setlists go to the Recycle Bin with it.", "Delete"))
                return;

            SwitchRequested?.Invoke(this, _libraries.Libraries.First(l => l.Id != doomed.Id));
            if (_libraries.Current.Id == doomed.Id)
                return;   // the switch was cancelled or failed; nothing was deleted

            _libraries.Remove(doomed.Id);
            SaveLibraries();
            NotifyLibrariesChanged();
            try
            {
                _libraries.Discard(doomed);
                _dialogs.Notify(NotificationKind.Success, $"Deleted the library “{doomed.Name}”");
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _dialogs.Notify(NotificationKind.Error, $"Couldn't delete the file of “{doomed.Name}”", ex.Message);
            }
        }

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
                _dialogs.Notify(NotificationKind.Error, "Couldn't read the song library", ex.Message);
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
            {
                string list = string.Join("\n", errors.Take(MaxListedErrors));
                if (errors.Count > MaxListedErrors)
                    list += $"\nand {errors.Count - MaxListedErrors} more";
                _dialogs.Notify(NotificationKind.Error, "Couldn't read these files", list);
            }
            try
            {
                Library.AddSongs(songs);
                if (songs.Count > 0)
                    _dialogs.Notify(NotificationKind.Success, songs.Count == 1 ? "Imported 1 song" : $"Imported {songs.Count} songs");
            }
            catch (SqliteException ex)
            {
                _dialogs.Notify(NotificationKind.Error, "Couldn't add the songs to the library", ex.Message);
            }
            Refresh();
        }

        public void Delete(SongSummary song)
        {
            try
            {
                int setlists = Library.SetlistCountFor(song.Id);
                string detail = setlists switch
                {
                    0 => "This can't be undone.",
                    1 => "It will also be taken out of 1 setlist. This can't be undone.",
                    _ => $"It will also be taken out of {setlists} setlists. This can't be undone.",
                };
                if (!_dialogs.Confirm("Delete song", $"Delete “{song.DisplayTitle}” from the library?", detail, "Delete"))
                    return;
                Library.DeleteSong(song.Id);
            }
            catch (SqliteException ex)
            {
                _dialogs.Notify(NotificationKind.Error, $"Couldn't delete \"{song.DisplayTitle}\"", ex.Message);
                return;
            }
            Refresh();
            SongDeleted?.Invoke(this, song.Id);
            _dialogs.Notify(NotificationKind.Success, $"Deleted \"{song.DisplayTitle}\"");
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
