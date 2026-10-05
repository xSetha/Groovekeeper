using System.Collections.ObjectModel;
using SongCreator.Music;

namespace SongCreator.Models
{
    public class Song : ObservableObject
    {
        private string _title = "";
        private string _artist = "";
        private string _key = "";

        public string Title
        {
            get => _title;
            set
            {
                if (SetProperty(ref _title, value))
                    OnPropertyChanged(nameof(DisplayTitle));
            }
        }

        /// <summary>What a song without a title is called.</summary>
        public const string UntitledTitle = "Untitled song";

        public string DisplayTitle => Title.Length > 0 ? Title : UntitledTitle;

        public string Artist { get => _artist; set => SetProperty(ref _artist, value); }
        public string Key { get => _key; set => SetProperty(ref _key, value); }

        public ObservableCollection<Section> Sections { get; } = new();

        /// <summary>Notes floating over the song (see <see cref="SongNote"/>); not part of the song's text.</summary>
        public ObservableCollection<SongNote> Notes { get; } = new();

        /// <summary>
        /// Moves every chord by some semitones. The song's key is what the user set, so it stays as it is.
        /// </summary>
        public void Transpose(int semitones)
        {
            // Chords are spelled with the sharps or flats of the key they move to: the key their chords are in,
            // moved too (so going up and back down returns the same names). When no key stands out, each chord
            // keeps its own kind of accidental.
            var chords = Sections.SelectMany(s => s.Lines).SelectMany(l => l.Chords.OrderBy(c => c.Position)).ToList();
            string? key = KeyDetector.Detect(chords.Select(c => c.Name).ToList());
            bool? useFlats = key == null ? null : MusicKeys.UsesFlats(MusicKeys.Transpose(key, semitones));
            foreach (var chord in chords)
                chord.Name = ChordTransposer.Transpose(chord.Name, semitones, useFlats);
        }

        public Song Clone()
        {
            var copy = new Song { Title = Title, Artist = Artist, Key = Key };
            foreach (var section in Sections)
                copy.Sections.Add(section.Clone());
            foreach (var note in Notes)
                copy.Notes.Add(note.Clone());
            return copy;
        }

        public bool HasContent =>
            Title.Length > 0 || Artist.Length > 0 ||
            Sections.SelectMany(s => s.Lines).Any(l => l.Text.Length > 0 || l.Chords.Count > 0) || Notes.Count > 0;

        /// <summary>
        /// A blank song with the usual section layout, each section holding one empty line.
        /// </summary>
        public static Song CreateTemplate()
        {
            var song = new Song();
            foreach (var name in new[] { "Intro", "Verse 1", "Chorus", "Verse 2", "Bridge", "Outro" })
            {
                var section = new Section(name);
                section.Lines.Add(new SongLine());
                song.Sections.Add(section);
            }
            return song;
        }
    }
}
