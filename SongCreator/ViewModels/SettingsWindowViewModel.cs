namespace SongCreator.ViewModels
{
    /// <summary>What the Settings window shows: the options, the theme choices and the app's version.</summary>
    public record SettingsWindowViewModel(AppSettingsViewModel Settings, ThemesViewModel? Themes, string Version);
}
