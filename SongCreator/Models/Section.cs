using System.Collections.ObjectModel;

namespace SongCreator.Models
{
    public class Section : ObservableObject
    {
        private string _name;

        public Section(string name, bool isRepeat = false)
        {
            _name = name;
            IsRepeat = isRepeat;
        }

        public string Name
        {
            get => _name;
            set => SetProperty(ref _name, value);
        }

        /// <summary>A marker saying "play [Name] again": it has no lines of its own.</summary>
        public bool IsRepeat { get; set; }

        public ObservableCollection<SongLine> Lines { get; } = new();

        public Section Clone()
        {
            var copy = new Section(Name, IsRepeat);
            foreach (var line in Lines)
                copy.Lines.Add(line.Clone());
            return copy;
        }
    }
}
