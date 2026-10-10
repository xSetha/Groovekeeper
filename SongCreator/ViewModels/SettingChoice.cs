namespace SongCreator.ViewModels
{
    /// <summary>One choice of an option in Settings, with the words that name it.</summary>
    public record SettingChoice<T>(T Value, string Label);
}
