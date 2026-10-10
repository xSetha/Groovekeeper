using SongCreator.IO;

namespace SongCreator.ViewModels
{
    /// <summary>A library in the switcher's menu.</summary>
    public record LibraryOption(LibraryInfo Info, bool IsCurrent)
    {
        public string Name => Info.Name;
    }
}
