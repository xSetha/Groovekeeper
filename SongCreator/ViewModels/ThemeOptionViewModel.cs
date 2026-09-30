using System.Windows.Input;
using System.Windows.Media;
using SongCreator.Models;
using SongCreator.Themes;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// One theme in the picker, with brushes from that theme so it can be previewed without applying it.
    /// </summary>
    public class ThemeOptionViewModel : ObservableObject
    {
        public ThemeOptionViewModel(Theme theme)
        {
            Theme = theme;
            var resources = ThemeManager.LoadResources(theme);
            Background = (Brush)resources["WindowBackground"];
            Surface = (Brush)resources["CardBackground"];
            Border = (Brush)resources["CardBorder"];
            Accent = (Brush)resources["AccentFill"];
            ChordBackground = (Brush)resources["ChordTagBackground"];
            ChordForeground = (Brush)resources["ChordTagForeground"];
            Text = (Brush)resources["TextForeground"];
            SelectCommand = new RelayCommand(() => ThemeManager.Apply(theme));
        }

        public Theme Theme { get; }
        public string Name => Theme.Name;
        public string Description => Theme.Description;

        public Brush Background { get; }
        public Brush Surface { get; }
        public Brush Border { get; }
        public Brush Accent { get; }
        public Brush ChordBackground { get; }
        public Brush ChordForeground { get; }
        public Brush Text { get; }

        public bool IsCurrent => ThemeManager.Current == Theme;

        public ICommand SelectCommand { get; }

        public void Refresh() => OnPropertyChanged(nameof(IsCurrent));
    }
}
