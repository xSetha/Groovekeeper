using System.Collections.ObjectModel;

namespace SongCreator.Models
{
    public class Section : ObservableObject
    {
        private string _name;

        public Section(string name)
        {
            _name = name;
        }

        public string Name
        {
            get => _name;
            set => SetProperty(ref _name, value);
        }

        public ObservableCollection<SongLine> Lines { get; } = new();
    }
}
