using System.Collections.ObjectModel;
using System.IO;
using System.Text.Json;
using System.Windows.Input;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Services;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// The setlist window: songs in playing order, each in the key chosen for the gig, saved as a .setlist file
    /// and exported as one PDF.
    /// </summary>
    public class SetlistViewModel : ObservableObject
    {
        private readonly IDialogService _dialogs;
        private string _name = "New setlist";
        private string? _filePath;
        private bool _isDirty;
        private bool _includeTableOfContents = true;
        private bool _romanNumerals;
        private bool _openWhenDone = true;

        public SetlistViewModel(IDialogService dialogs)
        {
            _dialogs = dialogs;
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

            AddSongsCommand = new RelayCommand(() => AddFiles(_dialogs.PickSongsToOpen()));
            MoveUpCommand = new RelayCommand<SetlistItemViewModel>(item => Move(item, -1));
            MoveDownCommand = new RelayCommand<SetlistItemViewModel>(item => Move(item, 1));
            RemoveCommand = new RelayCommand<SetlistItemViewModel>(item => Items.Remove(item));
            OpenCommand = new RelayCommand(Open);
            SaveCommand = new RelayCommand(() => Save());
            ExportCommand = new RelayCommand(Export);
            IsDirty = false;
        }

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

        /// <summary>The .setlist file this was opened from or saved to, if any.</summary>
        public string? FilePath
        {
            get => _filePath;
            private set => SetProperty(ref _filePath, value);
        }

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
        public ICommand OpenCommand { get; }
        public ICommand SaveCommand { get; }
        public ICommand ExportCommand { get; }

        public void AddFiles(IEnumerable<string> paths)
        {
            foreach (string path in paths)
                if (LoadSong(path, "") is { } item)
                    Items.Add(item);
        }

        public void Open()
        {
            if (!ConfirmClose())
                return;
            string? path = _dialogs.PickSetlistToOpen();
            if (path != null)
                Load(path);
        }

        public void Load(string path)
        {
            Setlist setlist;
            try
            {
                setlist = SetlistFile.Load(path);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
            {
                _dialogs.ShowError("Open setlist", $"Couldn't open {Path.GetFileName(path)}:\n{ex.Message}");
                return;
            }

            Items.Clear();
            foreach (var entry in setlist.Songs)
                if (LoadSong(entry.Path, entry.Key) is { } item)
                    Items.Add(item);
            Name = setlist.Name;
            FilePath = path;
            IsDirty = false;
        }

        /// <summary>Saves to the setlist's file, asking for one the first time. Returns false if cancelled or failed.</summary>
        public bool Save()
        {
            string? path = FilePath ?? _dialogs.PickSetlistSavePath(string.Concat(Name.Split(Path.GetInvalidFileNameChars())));
            if (path == null)
                return false;
            try
            {
                SetlistFile.Save(path, new Setlist(Name, Items.Select(i => new SetlistEntry(i.FilePath, i.Key)).ToList()));
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _dialogs.ShowError("Save setlist", $"Couldn't save {Path.GetFileName(path)}:\n{ex.Message}");
                return false;
            }
            FilePath = path;
            IsDirty = false;
            return true;
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

        private SetlistItemViewModel? LoadSong(string path, string key)
        {
            try
            {
                return new SetlistItemViewModel(SongFile.Load(path), path, key);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _dialogs.ShowError("Setlist", $"Couldn't open {Path.GetFileName(path)}:\n{ex.Message}");
                return null;
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
