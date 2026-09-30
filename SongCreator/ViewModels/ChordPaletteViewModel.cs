using System.Collections;
using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// The chord palette next to the editor: chords in the song's key, chords already used, and all chords by root.
    /// </summary>
    public class ChordPaletteViewModel : ObservableObject
    {
        private readonly Song _song;
        private string _selectedRoot;
        private string _selectedBass = NoBass;

        /// <summary>The bass option meaning "no slash chord".</summary>
        public const string NoBass = "—";

        public ChordPaletteViewModel(Song song)
        {
            _song = song;
            _selectedRoot = ChordTheory.RootOf(song.Key) ?? "C";

            song.PropertyChanged += Song_PropertyChanged;
            Watch(song.Sections);
            RefreshUsedChords();
        }

        public bool HasKey => KeyChords.Count > 0;
        public string KeyTitle => $"In {_song.Key}";
        public IReadOnlyList<string> KeyChords => ChordTheory.DiatonicChords(_song.Key);

        /// <summary>Distinct chords in the song, in order of first appearance.</summary>
        public ObservableCollection<string> UsedChords { get; } = new();
        public bool HasUsedChords => UsedChords.Count > 0;

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
        public IReadOnlyList<string> RootChords
        {
            get
            {
                string slash = SelectedBass == NoBass || SelectedBass == SelectedRoot ? "" : "/" + SelectedBass;
                return ChordTheory.Qualities.Select(quality => SelectedRoot + quality + slash).ToList();
            }
        }

        private void Song_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(Song.Key))
            {
                OnPropertyChanged(nameof(KeyChords));
                OnPropertyChanged(nameof(KeyTitle));
                OnPropertyChanged(nameof(HasKey));
            }
        }

        private void RefreshUsedChords()
        {
            var used = _song.Sections.SelectMany(s => s.Lines).SelectMany(l => l.Chords)
                .Select(c => c.Name).Where(name => name.Length > 0).Distinct().ToList();
            if (used.SequenceEqual(UsedChords))
                return;
            UsedChords.Clear();
            foreach (string name in used)
                UsedChords.Add(name);
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
                Watch(item);
            RefreshUsedChords();
        }

        private void Chord_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(ChordPlacement.Name))
                RefreshUsedChords();
        }
    }
}
