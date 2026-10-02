using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;

namespace SongCreator.Themes
{
    public record Theme(string Name, string Description);

    /// <summary>
    /// Swaps the active theme dictionary (the first merged dictionary in App.xaml) and remembers the choice.
    /// </summary>
    public static class ThemeManager
    {
        public static IReadOnlyList<Theme> Themes { get; } =
        [
            new("Amp", "Black with blood red, like a guitar amp"),
            new("Backstage", "Warm charcoal with brass"),
            new("Record Sleeve", "Forest green, cream and mustard"),
            new("Songbook", "Cream paper with red ink chords"),
        ];

        private static readonly Dictionary<string, string> Sources = new()
        {
            ["Amp"] = "Themes/Amp.xaml",
            ["Backstage"] = "Themes/Backstage.xaml",
            ["Record Sleeve"] = "Themes/RecordSleeve.xaml",
            ["Songbook"] = "Themes/Songbook.xaml",
        };

        // Themes of earlier versions, and the theme that took each one's place
        private static readonly Dictionary<string, string> Replaced = new()
        {
            ["Studio"] = "Backstage",
            ["Aurora"] = "Amp",
            ["Paper"] = "Songbook",
        };

        private static readonly string SettingsFile = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "SongCreator", "theme.txt");

        public static event EventHandler? ThemeChanged;

        public static Theme Current { get; private set; } = Themes[0];

        public static void LoadSaved()
        {
            try
            {
                string name = File.ReadAllText(SettingsFile).Trim();
                name = Replaced.GetValueOrDefault(name, name);
                var theme = Themes.FirstOrDefault(t => t.Name == name);
                if (theme != null)
                    Apply(theme, save: false);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // No saved theme yet: keep the default.
            }
        }

        public static void Apply(Theme theme, bool save = true)
        {
            Application.Current.Resources.MergedDictionaries[0] = LoadResources(theme);
            Current = theme;

            foreach (Window window in Application.Current.Windows)
                ApplyTitleBar(window);
            ThemeChanged?.Invoke(null, EventArgs.Empty);

            if (save)
            {
                try
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(SettingsFile)!);
                    File.WriteAllText(SettingsFile, theme.Name);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    // Not being able to remember the theme isn't worth interrupting the user.
                }
            }
        }

        /// <summary>Loads a theme's brushes and fonts without applying them (e.g. for previews).</summary>
        public static ResourceDictionary LoadResources(Theme theme) =>
            new() { Source = new Uri(Sources[theme.Name], UriKind.Relative) };

        // ---- Title bar (Windows 11; ignored by older versions) ----

        private const int DwmwaUseImmersiveDarkMode = 20;
        private const int DwmwaCaptionColor = 35;
        private const int DwmwaTextColor = 36;

        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        /// <summary>
        /// Colors the window's title bar like the menu bar, so the theme reaches the top edge of the window.
        /// </summary>
        public static void ApplyTitleBar(Window window)
        {
            var hwnd = new WindowInteropHelper(window).Handle;
            if (hwnd == IntPtr.Zero)
                return;

            int dark = (bool)Application.Current.Resources["IsDarkTheme"] ? 1 : 0;
            DwmSetWindowAttribute(hwnd, DwmwaUseImmersiveDarkMode, ref dark, sizeof(int));

            if (Application.Current.Resources["ToolbarBackground"] is SolidColorBrush caption &&
                Application.Current.Resources["TextForeground"] is SolidColorBrush text)
            {
                int captionColor = ToColorRef(caption.Color);
                int textColor = ToColorRef(text.Color);
                DwmSetWindowAttribute(hwnd, DwmwaCaptionColor, ref captionColor, sizeof(int));
                DwmSetWindowAttribute(hwnd, DwmwaTextColor, ref textColor, sizeof(int));
            }
        }

        private static int ToColorRef(Color color) => color.R | (color.G << 8) | (color.B << 16);
    }
}
