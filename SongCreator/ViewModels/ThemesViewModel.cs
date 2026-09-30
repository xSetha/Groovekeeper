using SongCreator.Themes;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// The theme picker: one option per theme, kept in sync with the active theme.
    /// </summary>
    public class ThemesViewModel
    {
        public ThemesViewModel()
        {
            Options = ThemeManager.Themes.Select(theme => new ThemeOptionViewModel(theme)).ToList();
            ThemeManager.ThemeChanged += (_, _) =>
            {
                foreach (var option in Options)
                    option.Refresh();
            };
        }

        public IReadOnlyList<ThemeOptionViewModel> Options { get; }
    }
}
