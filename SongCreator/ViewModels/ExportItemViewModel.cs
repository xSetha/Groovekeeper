using SongCreator.Models;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// A song in the export list: an open tab or a file added just for the export.
    /// </summary>
    public class ExportItemViewModel(Song song, string source, string? filePath = null) : ObservableObject
    {
        private bool _isSelected = true;
        private int _position;

        public Song Song { get; } = song;

        /// <summary>Where the song comes from, e.g. "Open tab" or a file name.</summary>
        public string Source { get; } = source;

        public string? FilePath { get; } = filePath;

        /// <summary>Source plus artist, e.g. "Open tab · Traditional".</summary>
        public string Details { get; } = song.Artist.Length > 0 ? $"{source}  ·  {song.Artist}" : source;

        /// <summary>1-based place in the export order.</summary>
        public int Position
        {
            get => _position;
            set => SetProperty(ref _position, value);
        }

        public bool IsSelected
        {
            get => _isSelected;
            set => SetProperty(ref _isSelected, value);
        }
    }
}
