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

        public void Transpose(int semitones)
        {
            // The key gets its usual name, and every chord is spelled with that key's sharps or flats
            // (so going up and back down returns the same names). Without a key, chords keep their own spelling.
            Key = MusicKeys.Transpose(Key, semitones);
            bool? useFlats = MusicKeys.UsesFlats(Key);
            foreach (var chord in Sections.SelectMany(s => s.Lines).SelectMany(l => l.Chords))
                chord.Name = ChordTransposer.Transpose(chord.Name, semitones, useFlats);
        }

        public Song Clone()
        {
            var copy = new Song { Title = Title, Artist = Artist, Key = Key };
            foreach (var section in Sections)
                copy.Sections.Add(section.Clone());
            return copy;
        }

        public bool HasContent =>
            Title.Length > 0 || Artist.Length > 0 ||
            Sections.SelectMany(s => s.Lines).Any(l => l.Text.Length > 0 || l.Chords.Count > 0);

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
