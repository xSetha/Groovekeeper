using System.IO;
using SongCreator.Models;
using SongCreator.Music;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// A song in a setlist and the key to play it in. The song file is never changed: the export transposes a copy.
    /// A song without a key uses the key detected from its chords.
    /// </summary>
    public class SetlistItemViewModel : ObservableObject
    {
        private string _key;
        private int _position;

        public SetlistItemViewModel(Song song, string filePath, string key = "")
        {
            Song = song;
            FilePath = filePath;
            if (MusicKeys.TryParse(song.Key, out _, out _))
            {
                OriginalKey = song.Key;
            }
            else
            {
                var chords = song.Sections.SelectMany(s => s.Lines).SelectMany(l => l.Chords.OrderBy(c => c.Position)).Select(c => c.Name).ToList();
                OriginalKey = KeyDetector.Detect(chords) ?? "";
                IsKeyDetected = OriginalKey.Length > 0;
            }

            // The twelve keys of the same mode, from C up, with their usual names.
            KeyOptions = OriginalKey.Length == 0
                ? []
                : Enumerable.Range(0, 12).Select(semitones => MusicKeys.Transpose(OriginalKey, semitones)).OrderBy(PitchOf).ToList();
            _key = KeyOptions.FirstOrDefault(option => SameKey(option, key))
                ?? KeyOptions.FirstOrDefault(option => SameKey(option, OriginalKey))
                ?? "";
        }

        public Song Song { get; }

        public string FilePath { get; }

        public string FileName => Path.GetFileName(FilePath);

        /// <summary>The key the song is written in (or detected in), empty if unknown.</summary>
        public string OriginalKey { get; }

        public bool IsKeyDetected { get; }

        public IReadOnlyList<string> KeyOptions { get; }

        public bool HasKey => KeyOptions.Count > 0;

        /// <summary>The key to play the song in.</summary>
        public string Key
        {
            get => _key;
            set
            {
                if (SetProperty(ref _key, value))
                {
                    OnPropertyChanged(nameof(Semitones));
                    OnPropertyChanged(nameof(KeyNote));
                }
            }
        }

        /// <summary>How far <see cref="Key"/> is from the original key, the short way round (-5 … +6).</summary>
        public int Semitones
        {
            get
            {
                if (!HasKey)
                    return 0;
                int up = (PitchOf(Key) - PitchOf(OriginalKey) + 12) % 12;
                return up > 6 ? up - 12 : up;
            }
        }

        /// <summary>E.g. "original key", "+2 from G", "key detected: Am", "no key".</summary>
        public string KeyNote
        {
            get
            {
                if (!HasKey)
                    return "no key, plays as written";
                string note = Semitones == 0 ? "original key" : $"{Semitones:+0;−0} from {OriginalKey}";
                return IsKeyDetected ? $"{note} (detected)" : note;
            }
        }

        /// <summary>1-based place in the setlist.</summary>
        public int Position
        {
            get => _position;
            set => SetProperty(ref _position, value);
        }

        /// <summary>The song as it will be played: a transposed copy when the key differs.</summary>
        public Song SongToPlay()
        {
            if (Semitones == 0 && !IsKeyDetected)
                return Song;
            var copy = Song.Clone();
            copy.Key = OriginalKey;
            if (Semitones != 0)
                copy.Transpose(Semitones);
            return copy;
        }

        private static int PitchOf(string key) => MusicKeys.TryParse(key, out var tonic, out _) ? tonic.PitchClass : 0;

        private static bool SameKey(string a, string b) =>
            MusicKeys.TryParse(b, out _, out bool minor) && minor == a.EndsWith('m') && PitchOf(a) == PitchOf(b);
    }
}
