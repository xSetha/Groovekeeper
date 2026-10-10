using SongCreator.IO;

namespace SongCreator.ViewModels
{
    /// <summary>A choice in the export windows' Chords drop-down.</summary>
    public record ChordStyleOption(ChordStyle Style, string Label)
    {
        public static IReadOnlyList<ChordStyleOption> All { get; } =
        [
            new(ChordStyle.Letters, "A B C (letters)"),
            new(ChordStyle.Solfege, "Do Re Mi"),
            new(ChordStyle.Numerals, "I IV V (Roman numerals)"),
        ];
    }
}
