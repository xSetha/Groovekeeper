using SongCreator.Models;

namespace SongCreator.ViewModels
{
    /// <summary>A library song in a setlist, played and exported as it is written.</summary>
    public class SetlistItemViewModel : ObservableObject
    {
        private int _position;

        public SetlistItemViewModel(Song song, long songId)
        {
            Song = song;
            SongId = songId;
        }

        public Song Song { get; }

        public long SongId { get; }

        /// <summary>1-based place in the setlist.</summary>
        public int Position
        {
            get => _position;
            set => SetProperty(ref _position, value);
        }
    }
}
