using System.Collections.ObjectModel;
using SongCreator.Music;

namespace SongCreator.Models
{
    public class Song : ObservableObject
    {
        private string _title = "";
        private string _artist = "";
        private string _tuning = "E A D G B E";
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

        public string DisplayTitle => Title.Length > 0 ? Title : "Untitled song";

        public string Artist { get => _artist; set => SetProperty(ref _artist, value); }
        public string Tuning { get => _tuning; set => SetProperty(ref _tuning, value); }
        public string Key { get => _key; set => SetProperty(ref _key, value); }

        public ObservableCollection<Section> Sections { get; } = new();

        public void Transpose(int semitones)
        {
            Key = ChordTransposer.Transpose(Key, semitones);
            foreach (var chord in Sections.SelectMany(s => s.Lines).SelectMany(l => l.Chords))
                chord.Name = ChordTransposer.Transpose(chord.Name, semitones);
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
