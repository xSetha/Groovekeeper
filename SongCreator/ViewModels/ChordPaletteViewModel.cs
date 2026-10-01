using System.Collections;
using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;
using System.Windows.Input;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// A chord chip in the palette. <paramref name="Numeral"/> is its Roman numeral in the song's key (null without a key);
    /// <paramref name="InKey"/> says whether it is built on the key's scale.
    /// </summary>
    public record PaletteChord(string Name, string? Numeral, bool InKey);

    /// <summary>
    /// The chord palette next to the editor: chords that usually come next, chords in the song's key, chords already used,
    /// and all chords by root. It also guesses the song's key from its chords.
    /// </summary>
    public class ChordPaletteViewModel : ObservableObject
    {
        private readonly Song _song;
        private string _selectedRoot;
        private string _selectedBass = NoBass;
        private string? _lastPlaced;
        private string? _detectedKey;

        /// <summary>The bass option meaning "no slash chord".</summary>
        public const string NoBass = "—";

        public ChordPaletteViewModel(Song song)
        {
            _song = song;
            _selectedRoot = ChordTheory.RootOf(song.Key) ?? "C";

            song.PropertyChanged += Song_PropertyChanged;
            Watch(song.Sections);
            RefreshUsedChords();
            UseDetectedKeyCommand = new RelayCommand(() => _song.Key = DetectedKey ?? _song.Key);
        }

        public bool HasKey => KeyChords.Count > 0;
        public string KeyTitle => $"In {_song.Key}";
        public IReadOnlyList<PaletteChord> KeyChords => Chips(ChordTheory.DiatonicChords(_song.Key));

        /// <summary>Chords that commonly follow the chord placed last (or the song's last chord), in the song's key.</summary>
        public IReadOnlyList<PaletteChord> SuggestedChords =>
            Chips(ChordTheory.SuggestNext(_lastPlaced ?? AllChords().LastOrDefault() ?? "", _song.Key));
        public bool HasSuggestions => SuggestedChords.Count > 0;
        public string SuggestionsTitle => $"After {_lastPlaced ?? AllChords().LastOrDefault()}";

        /// <summary>Distinct chords in the song, in order of first appearance.</summary>
        public ObservableCollection<PaletteChord> UsedChords { get; } = new();
        public bool HasUsedChords => UsedChords.Count > 0;

        /// <summary>The key the song's chords suggest, or null.</summary>
        public string? DetectedKey
        {
            get => _detectedKey;
            private set
            {
                if (SetProperty(ref _detectedKey, value))
                    OnPropertyChanged(nameof(ShowKeySuggestion));
            }
        }

        /// <summary>Whether to offer the detected key: there is one and the song isn't already in it.</summary>
        public bool ShowKeySuggestion =>
            DetectedKey != null && MusicKeys.Transpose(DetectedKey, 0) != MusicKeys.Transpose(_song.Key, 0);

        public ICommand UseDetectedKeyCommand { get; }

        public IReadOnlyList<string> Roots => ChordTheory.Roots;

        public string SelectedRoot
        {
            get => _selectedRoot;
            set
            {
                if (SetProperty(ref _selectedRoot, value))
                    OnPropertyChanged(nameof(RootChords));
            }
        }

        /// <summary>"—" (no bass) followed by every root: picking one turns the chords below into slash chords.</summary>
        public IReadOnlyList<string> BassOptions { get; } = [NoBass, .. ChordTheory.Roots];

        public string SelectedBass
        {
            get => _selectedBass;
            set
            {
                if (SetProperty(ref _selectedBass, value))
                    OnPropertyChanged(nameof(RootChords));
            }
        }

        /// <summary>Every chord type on the selected root, over the selected bass (e.g. "G/B", "Gm7/B").</summary>
        public IReadOnlyList<PaletteChord> RootChords
        {
            get
            {
                string slash = SelectedBass == NoBass || SelectedBass == SelectedRoot ? "" : "/" + SelectedBass;
                return Chips(ChordTheory.Qualities.Select(quality => SelectedRoot + quality + slash));
            }
        }

        private List<PaletteChord> Chips(IEnumerable<string> names) =>
            names.Select(name => new PaletteChord(name, RomanNumerals.Of(name, _song.Key), ChordTheory.FitsKey(name, _song.Key))).ToList();

        private IEnumerable<string> AllChords() =>
            _song.Sections.SelectMany(s => s.Lines).SelectMany(l => l.Chords.OrderBy(c => c.Position))
                .Select(c => c.Name).Where(name => name.Length > 0);

        private void Song_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(Song.Key))
            {
                OnPropertyChanged(nameof(KeyChords));
                OnPropertyChanged(nameof(KeyTitle));
                OnPropertyChanged(nameof(HasKey));
                OnPropertyChanged(nameof(RootChords));
                OnPropertyChanged(nameof(ShowKeySuggestion));
                RefreshUsedChords(force: true);
            }
        }

        /// <summary>Updates everything that depends on the song's chords (with <paramref name="force"/>, even if the names are the same).</summary>
        private void RefreshUsedChords(bool force = false)
        {
            DetectedKey = KeyDetector.Detect(AllChords().ToList());
            OnPropertyChanged(nameof(SuggestedChords));
            OnPropertyChanged(nameof(HasSuggestions));
            OnPropertyChanged(nameof(SuggestionsTitle));

            var used = AllChords().Distinct().ToList();
            if (!force && used.SequenceEqual(UsedChords.Select(c => c.Name)))
                return;
            UsedChords.Clear();
            foreach (var chip in Chips(used))
                UsedChords.Add(chip);
            OnPropertyChanged(nameof(HasUsedChords));
        }

        // ---- Follow every chord in the song (sections, lines and chords come and go while editing) ----

        private void Watch(IEnumerable items)
        {
            if (items is INotifyCollectionChanged collection)
                collection.CollectionChanged += Collection_CollectionChanged;
            foreach (var item in items)
                Watch(item);
        }

        private void Watch(object item)
        {
            switch (item)
            {
                case Section section:
                    Watch(section.Lines);
                    break;
                case SongLine line:
                    Watch(line.Chords);
                    break;
                case ChordPlacement chord:
                    chord.PropertyChanged += Chord_PropertyChanged;
                    break;
            }
        }

        private void Unwatch(object item)
        {
            switch (item)
            {
                case Section section:
                    section.Lines.CollectionChanged -= Collection_CollectionChanged;
                    foreach (var line in section.Lines)
                        Unwatch(line);
                    break;
                case SongLine line:
                    line.Chords.CollectionChanged -= Collection_CollectionChanged;
                    foreach (var chord in line.Chords)
                        Unwatch(chord);
                    break;
                case ChordPlacement chord:
                    chord.PropertyChanged -= Chord_PropertyChanged;
                    break;
            }
        }

        private void Collection_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
        {
            foreach (var item in e.OldItems ?? Array.Empty<object>())
                Unwatch(item);
            foreach (var item in e.NewItems ?? Array.Empty<object>())
            {
                Watch(item);
                if (item is ChordPlacement chord && e.Action == NotifyCollectionChangedAction.Add)
                    _lastPlaced = chord.Name;
            }
            RefreshUsedChords();
        }

        private void Chord_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(ChordPlacement.Name))
            {
                _lastPlaced = ((ChordPlacement)sender!).Name;
                RefreshUsedChords();
            }
        }
    }
}
