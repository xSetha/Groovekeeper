namespace SongCreator.Models
{
    /// <summary>
    /// A chord anchored above a character index of a lyric line.
    /// The position may exceed the text length (chord-only lines).
    /// </summary>
    public class ChordPlacement : ObservableObject
    {
        private int _position;
        private string _name;

        public ChordPlacement(int position, string name)
        {
            _position = position;
            _name = name;
        }

        public int Position
        {
            get => _position;
            set => SetProperty(ref _position, Math.Max(0, value));
        }

        public string Name
        {
            get => _name;
            set => SetProperty(ref _name, value);
        }
    }
}
