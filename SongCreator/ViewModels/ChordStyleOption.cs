using SongCreator.IO;
using SongCreator.Music;

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

        /// <summary>The style that matches how the editor writes chords, which the drop-down starts on.</summary>
        public static ChordStyle Of(NoteNaming naming) => naming == NoteNaming.Solfege ? ChordStyle.Solfege : ChordStyle.Letters;
    }
}
