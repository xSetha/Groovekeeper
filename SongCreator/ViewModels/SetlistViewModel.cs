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
    /// The Setlists tab: the library's setlists, and the selected one's songs in playing order, played as they are
    /// written. Every change is saved in the library right away. A setlist only refers to its songs: they are
    /// edited in the song editor, and the same song can be in several setlists. Older .setlist files can be imported.
    /// </summary>
    public class SetlistViewModel : ObservableObject
    {
        private const string NewSetlistName = "New setlist";

        private readonly IDialogService _dialogs;
        private readonly SongLibrary _library;
        private LibrarySetlist? _selectedSetlist;
        private string _name = "";
        // Set while a setlist is being shown, so filling the list doesn't save it again.
        private bool _loading;
        // Set while the setlist list is rebuilt, when the list view briefly clears its selection.
        private bool _updatingSetlists;
        private bool _includeTableOfContents = true;
        private bool _romanNumerals;
        private bool _collapseRepeats = true;
        private bool _openWhenDone = true;

        public SetlistViewModel(IDialogService dialogs, LibraryViewModel library)
        {
            _dialogs = dialogs;
            _library = library.Library;
            Library = library;
            Items.CollectionChanged += (_, _) =>
            {
                for (int i = 0; i < Items.Count; i++)
                    Items[i].Position = i + 1;
                OnPropertyChanged(nameof(IsEmpty));
                Save();
            };

            // A click on an empty part of a list sends no song.
            AddSongCommand = new RelayCommand<SongSummary?>(song => { if (song != null) AddSong(song, Items.Count); });
            MoveUpCommand = new RelayCommand<SetlistItemViewModel>(item => Move(Items.IndexOf(item), Items.IndexOf(item) - 1));
            MoveDownCommand = new RelayCommand<SetlistItemViewModel>(item => Move(Items.IndexOf(item), Items.IndexOf(item) + 1));
            RemoveCommand = new RelayCommand<SetlistItemViewModel>(item => Items.Remove(item));
            OpenSongCommand = new RelayCommand<SetlistItemViewModel>(item => OpenSongRequested?.Invoke(this, item.SongId));
            NewCommand = new RelayCommand(New);
            DeleteCommand = new RelayCommand(Delete);
            ImportCommand = new RelayCommand(Import);
            ExportCommand = new RelayCommand(Export);
            RefreshSetlists();
        }

        /// <summary>The song library, to add songs from.</summary>
        public LibraryViewModel Library { get; }

        /// <summary>The setlists saved in the library, by name.</summary>
        public ObservableCollection<LibrarySetlist> Setlists { get; } = new();

        /// <summary>The setlist being edited; its songs are in <see cref="Items"/>.</summary>
        public LibrarySetlist? SelectedSetlist
        {
            get => _selectedSetlist;
            set
            {
                if (_updatingSetlists)
                    return;
                long? previousId = _selectedSetlist?.Id;
                _selectedSetlist = value;
                OnPropertyChanged(nameof(SelectedSetlist));
                OnPropertyChanged(nameof(HasSelection));
                if (value?.Id != previousId)
                    Load();
            }
        }

        public bool HasSelection => SelectedSetlist != null;

        public bool HasSetlists => Setlists.Count > 0;

        public ObservableCollection<SetlistItemViewModel> Items { get; } = new();

        /// <summary>The selected setlist's name. Renaming saves it; a blank name is ignored.</summary>
        public string Name
        {
            get => _name;
            set
            {
                string name = value.Trim();
                if (name.Length == 0 || SelectedSetlist == null)
                {
                    OnPropertyChanged(nameof(Name));   // puts the old name back in the box
                    return;
                }
                if (!SetProperty(ref _name, name) || _loading)
                    return;
                Save();
                RefreshSetlists();
            }
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

        /// <summary>Print a section that is an exact copy of an earlier one as a repeat, e.g. "[Chorus] (repeat)".</summary>
        public bool CollapseRepeats
        {
            get => _collapseRepeats;
            set => SetProperty(ref _collapseRepeats, value);
        }

        public bool OpenWhenDone
        {
            get => _openWhenDone;
            set => SetProperty(ref _openWhenDone, value);
        }

        public ICommand AddSongCommand { get; }
        public ICommand MoveUpCommand { get; }
        public ICommand MoveDownCommand { get; }
        public ICommand RemoveCommand { get; }
        public ICommand OpenSongCommand { get; }
        public ICommand NewCommand { get; }
        public ICommand DeleteCommand { get; }
        public ICommand ImportCommand { get; }
        public ICommand ExportCommand { get; }

        /// <summary>Asks the window to open a library song in the song editor, with its id.</summary>
        public event EventHandler<long>? OpenSongRequested;

        /// <summary>Asks the view to focus the setlist's name, e.g. after creating one.</summary>
        public event EventHandler? FocusNameRequested;

        /// <summary>
        /// Reloads the setlists and the selected one's songs from the library, to show songs edited, renamed or deleted
        /// since.
        /// </summary>
        public void Refresh()
        {
            RefreshSetlists();
            Load();
        }

        /// <summary>Adds a library song at <paramref name="index"/> in the selected setlist.</summary>
        public void AddSong(SongSummary song, int index)
        {
            if (SelectedSetlist != null && LoadSong(song.Id) is { } item)
                Items.Insert(Math.Clamp(index, 0, Items.Count), item);
        }

        /// <summary>Moves a song to another place in the setlist; out-of-range places are ignored.</summary>
        public void Move(int from, int to)
        {
            if (from >= 0 && from < Items.Count && to >= 0 && to < Items.Count && from != to)
                Items.Move(from, to);
        }

        /// <summary>Creates an empty setlist in the library and selects it.</summary>
        public void New()
        {
            long id;
            try
            {
                id = _library.SaveSetlist(null, NewSetlistName, []);
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("New setlist", $"Couldn't create the setlist in the library:\n{ex.Message}");
                return;
            }
            RefreshSetlists();
            SelectedSetlist = Setlists.FirstOrDefault(s => s.Id == id);
            FocusNameRequested?.Invoke(this, EventArgs.Empty);
        }

        /// <summary>Deletes the selected setlist from the library (its songs stay) and selects the next one.</summary>
        public void Delete()
        {
            if (SelectedSetlist is not { } setlist ||
                !_dialogs.Confirm("Delete setlist", $"Delete the setlist “{Name}”?", "Its songs stay in the library.", "Delete"))
                return;
            try
            {
                _library.DeleteSetlist(setlist.Id);
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Delete setlist", $"Couldn't delete the setlist:\n{ex.Message}");
                return;
            }
            int index = Setlists.IndexOf(setlist);
            RefreshSetlists();
            SelectedSetlist = Setlists.Count > 0 ? Setlists[Math.Clamp(index, 0, Setlists.Count - 1)] : null;
        }

        /// <summary>Imports a .setlist file: its songs are added to the library, and the setlist is saved there.</summary>
        public void Import()
        {
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

            var songs = new List<Song>();
            foreach (var entry in setlist.Songs)
            {
                try
                {
                    songs.Add(SongFile.Load(entry.Path));
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    _dialogs.ShowError("Import setlist", $"Couldn't open {Path.GetFileName(entry.Path)}:\n{ex.Message}");
                }
            }

            long id;
            try
            {
                var ids = _library.AddSongs(songs);
                id = _library.SaveSetlist(null, setlist.Name.Trim().Length > 0 ? setlist.Name.Trim() : NewSetlistName, ids);
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Import setlist", $"Couldn't add the setlist to the library:\n{ex.Message}");
                return;
            }
            Library.Refresh();
            RefreshSetlists();
            SelectedSetlist = Setlists.FirstOrDefault(s => s.Id == id);
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
                File.WriteAllBytes(path, SongPdfWriter.Create(Items.Select(i => i.Song).ToList(), IncludeTableOfContents, RomanNumerals,
                    collapseRepeats: CollapseRepeats));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _dialogs.ShowError("Export PDF", $"Couldn't write {Path.GetFileName(path)}:\n{ex.Message}");
                return;
            }

            if (OpenWhenDone)
                _dialogs.OpenWithDefaultApp(path);
        }

        /// <summary>Shows the selected setlist's name and songs, as saved in the library.</summary>
        private void Load()
        {
            LibrarySetlist? setlist = null;
            if (SelectedSetlist is { } selected)
            {
                try
                {
                    setlist = _library.LoadSetlist(selected.Id);
                }
                catch (SqliteException ex)
                {
                    _dialogs.ShowError("Open setlist", $"Couldn't read the setlist from the library:\n{ex.Message}");
                }
            }

            _loading = true;
            Items.Clear();
            if (setlist != null)
            {
                foreach (var item in setlist.Songs.Select(LoadSong).OfType<SetlistItemViewModel>())
                    Items.Add(item);
            }
            _name = setlist?.Name ?? "";
            OnPropertyChanged(nameof(Name));
            _loading = false;
        }

        private void Save()
        {
            if (_loading || SelectedSetlist is not { } setlist)
                return;
            try
            {
                _library.SaveSetlist(setlist.Id, Name, Items.Select(i => i.SongId).ToList());
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Save setlist", $"Couldn't save the setlist in the library:\n{ex.Message}");
            }
        }

        private SetlistItemViewModel? LoadSong(long songId)
        {
            try
            {
                return _library.LoadSong(songId) is { } song ? new SetlistItemViewModel(song, songId) : null;
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Setlist", $"Couldn't read a song from the library:\n{ex.Message}");
                return null;
            }
        }

        /// <summary>Reloads the list of setlists, keeping the same one selected (if it is still there).</summary>
        private void RefreshSetlists()
        {
            IReadOnlyList<LibrarySetlist> setlists;
            try
            {
                setlists = _library.ListSetlists();
            }
            catch (SqliteException ex)
            {
                _dialogs.ShowError("Setlists", $"Couldn't read the setlists from the library:\n{ex.Message}");
                setlists = [];
            }

            long? selectedId = _selectedSetlist?.Id;
            _updatingSetlists = true;
            // Only changed entries are replaced: a rename is saved when the name box loses focus, which can be in the
            // middle of a click on another setlist, and that click must still select it.
            for (int i = 0; i < setlists.Count; i++)
            {
                if (i == Setlists.Count)
                    Setlists.Add(setlists[i]);
                else if (Setlists[i].Id != setlists[i].Id || Setlists[i].Name != setlists[i].Name)
                    Setlists[i] = setlists[i];
            }
            while (Setlists.Count > setlists.Count)
                Setlists.RemoveAt(Setlists.Count - 1);
            _updatingSetlists = false;
            OnPropertyChanged(nameof(HasSetlists));

            _selectedSetlist = Setlists.FirstOrDefault(s => s.Id == selectedId);
            OnPropertyChanged(nameof(SelectedSetlist));
            OnPropertyChanged(nameof(HasSelection));
            if (_selectedSetlist == null && selectedId != null)
                Load();   // it was deleted: clear its songs
        }
    }
}
