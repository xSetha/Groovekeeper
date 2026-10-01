using System.Collections.ObjectModel;
using System.IO;
using System.Text.Json;
using System.Windows.Input;
using Microsoft.Data.Sqlite;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Services;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// The setlist window: library songs in playing order, each in the key chosen for the gig, saved in the
    /// library and exported as one PDF. Older .setlist files can be imported.
    /// </summary>
    public class SetlistViewModel : ObservableObject
    {
        private const string NewSetlistName = "New setlist";

        private readonly IDialogService _dialogs;
        private readonly SongLibrary _library;
        private string _name = NewSetlistName;
        private long? _setlistId;
        private bool _isDirty;
        private bool _includeTableOfContents = true;
        private bool _romanNumerals;
        private bool _openWhenDone = true;

        public SetlistViewModel(IDialogService dialogs, SongLibrary library)
        {
            _dialogs = dialogs;
            _library = library;
            Items.CollectionChanged += (_, e) =>
            {
                foreach (SetlistItemViewModel item in e.NewItems ?? Array.Empty<object>())
                    item.PropertyChanged += (_, change) =>
                    {
                        if (change.PropertyName == nameof(SetlistItemViewModel.Key))
                            IsDirty = true;
                    };
                for (int i = 0; i < Items.Count; i++)
                    Items[i].Position = i + 1;
                OnPropertyChanged(nameof(IsEmpty));
                IsDirty = true;
            };

            AddSongsCommand = new RelayCommand(() => AddSongs(_dialogs.PickLibrarySongs(_library)));
            MoveUpCommand = new RelayCommand<SetlistItemViewModel>(item => Move(item, -1));
            MoveDownCommand = new RelayCommand<SetlistItemViewModel>(item => Move(item, 1));
            RemoveCommand = new RelayCommand<SetlistItemViewModel>(item => Items.Remove(item));
            NewCommand = new RelayCommand(New);
            OpenCommand = new RelayCommand<LibrarySetlist>(setlist => Open(setlist.Id));
            SaveCommand = new RelayCommand(() => Save());
            DeleteCommand = new RelayCommand(Delete);
            ImportCommand = new RelayCommand(Import);
            ExportCommand = new RelayCommand(Export);
            RefreshSetlists();
            IsDirty = false;
        }

        /// <summary>The setlists saved in the library, to pick one to open.</summary>
        public ObservableCollection<LibrarySetlist> Setlists { get; } = new();

        public ObservableCollection<SetlistItemViewModel> Items { get; } = new();

        public string Name
        {
            get => _name;
            set
            {
                if (SetProperty(ref _name, value))
                    IsDirty = true;
            }
        }

        /// <summary>The library setlist this is, or null if it hasn't been saved yet.</summary>
        public long? SetlistId
        {
            get => _setlistId;
            private set
            {
                if (SetProperty(ref _setlistId, value))
                    OnPropertyChanged(nameof(IsSaved));
            }
        }

        public bool IsSaved => SetlistId != null;

        public bool IsDirty
        {
            get => _isDirty;
            private set => SetProperty(ref _isDirty, value);
        }

        public bool IsEmpty => Items.Count == 0;

        public bool IncludeTableOfContents
        {
            get => _includeTableOfContents;
            set => SetProperty(ref _includeTableOfContents, value);
        }

        public bool RomanNumerals
        {
            get => _romanNumerals;
            set => SetProperty(ref _romanNumerals, value);
        }

        public bool OpenWhenDone
        {
            get => _openWhenDone;
            set => SetProperty(ref _openWhenDone, value);
        }

        public ICommand AddSongsCommand { get; }
        public ICommand MoveUpCommand { get; }
        public ICommand MoveDownCommand { get; }
        public ICommand RemoveCommand { get; }
        public ICommand NewCommand { get; }
        public ICommand OpenCommand { get; }
        public ICommand SaveCommand { get; }
        public ICommand DeleteCommand { get; }
        public ICommand ImportCommand { get; }
        public ICommand ExportCommand { get; }

        public void AddSongs(IEnumerable<SongSummary> songs)
        {
            foreach (var song in songs)
                if (LoadSong(song.Id, "") is { } item)
                    Items.Add(item);
        }

        /// <summary>Starts an empty setlist (after asking to save unsaved changes).</summary>
        public void New()
        {
            if (!ConfirmClose())
                return;
            Show(null, NewSetlistName, []);
        }

        public void Open(long id)
        {
            if (!ConfirmClose())
                return;

            LibrarySetlist? setlist;
            try
            {
                setlist = _library.LoadSetlist(id);
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Open setlist", $"Couldn't read the setlist from the library:\n{ex.Message}");
                return;
            }
            if (setlist == null)
            {
                RefreshSetlists();
                return;
            }
            Show(setlist.Id, setlist.Name, setlist.Songs.Select(entry => LoadSong(entry.SongId, entry.Key)).OfType<SetlistItemViewModel>());
        }

        /// <summary>Saves the setlist in the library. Returns false if it failed.</summary>
        public bool Save()
        {
            try
            {
                SetlistId = _library.SaveSetlist(SetlistId, Name, Items.Select(i => new LibrarySetlistEntry(i.SongId, i.Key)).ToList());
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Save setlist", $"Couldn't save the setlist in the library:\n{ex.Message}");
                return false;
            }
            IsDirty = false;
            RefreshSetlists();
            return true;
        }

        /// <summary>Deletes the setlist from the library (its songs stay) and starts an empty one.</summary>
        public void Delete()
        {
            if (SetlistId is not long id || !_dialogs.Confirm("Delete setlist", $"Delete the setlist “{Name}”?", "Its songs stay in the library.", "Delete"))
                return;
            try
            {
                _library.DeleteSetlist(id);
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Delete setlist", $"Couldn't delete the setlist:\n{ex.Message}");
                return;
            }
            Show(null, NewSetlistName, []);
            RefreshSetlists();
        }

        /// <summary>Imports a .setlist file: its songs are added to the library and the setlist is saved there.</summary>
        public void Import()
        {
            if (!ConfirmClose())
                return;
            string? path = _dialogs.PickSetlistToImport();
            if (path != null)
                ImportFile(path);
        }

        public void ImportFile(string path)
        {
            Setlist setlist;
            try
            {
                setlist = SetlistFile.Load(path);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
            {
                _dialogs.ShowError("Import setlist", $"Couldn't open {Path.GetFileName(path)}:\n{ex.Message}");
                return;
            }

            var songs = new List<(Song Song, string Key)>();
            foreach (var entry in setlist.Songs)
            {
                try
                {
                    songs.Add((SongFile.Load(entry.Path), entry.Key));
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    _dialogs.ShowError("Import setlist", $"Couldn't open {Path.GetFileName(entry.Path)}:\n{ex.Message}");
                }
            }

            IReadOnlyList<long> ids;
            try
            {
                ids = _library.AddSongs(songs.Select(s => s.Song));
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Import setlist", $"Couldn't add the songs to the library:\n{ex.Message}");
                return;
            }
            Show(null, setlist.Name, songs.Select((s, i) => new SetlistItemViewModel(s.Song, ids[i], s.Key)));
            Save();
        }

        public void Export()
        {
            if (Items.Count == 0)
                return;
            string? path = _dialogs.PickPdfSavePath(string.Concat(Name.Split(Path.GetInvalidFileNameChars())));
            if (path == null)
                return;

            try
            {
                File.WriteAllBytes(path, SongPdfWriter.Create(Items.Select(i => i.SongToPlay()).ToList(), IncludeTableOfContents, RomanNumerals,
                    Items.Select(i => i.Semitones).ToList()));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _dialogs.ShowError("Export PDF", $"Couldn't write {Path.GetFileName(path)}:\n{ex.Message}");
                return;
            }

            if (OpenWhenDone)
                _dialogs.OpenWithDefaultApp(path);
        }

        /// <summary>Asks to save unsaved changes. Returns false if the user cancelled.</summary>
        public bool ConfirmClose()
        {
            if (!IsDirty)
                return true;
            return _dialogs.AskToSaveSetlist(Name) switch
            {
                SaveChoice.Save => Save(),
                SaveChoice.DontSave => true,
                _ => false,
            };
        }

        private SetlistItemViewModel? LoadSong(long songId, string key)
        {
            try
            {
                return _library.LoadSong(songId) is { } song ? new SetlistItemViewModel(song, songId, key) : null;
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Setlist", $"Couldn't read a song from the library:\n{ex.Message}");
                return null;
            }
        }

        private void Show(long? id, string name, IEnumerable<SetlistItemViewModel> items)
        {
            Items.Clear();
            foreach (var item in items)
                Items.Add(item);
            Name = name;
            SetlistId = id;
            IsDirty = false;
        }

        private void RefreshSetlists()
        {
            Setlists.Clear();
            try
            {
                foreach (var setlist in _library.ListSetlists())
                    Setlists.Add(setlist);
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Setlists", $"Couldn't read the setlists from the library:\n{ex.Message}");
            }
        }

        private void Move(SetlistItemViewModel item, int offset)
        {
            int from = Items.IndexOf(item);
            int to = from + offset;
            if (to >= 0 && to < Items.Count)
                Items.Move(from, to);
        }
    }
}
