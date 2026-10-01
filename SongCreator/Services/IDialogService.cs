using SongCreator.IO;
using SongCreator.ViewModels;

namespace SongCreator.Services
{
    public enum SaveChoice
    {
        Save,
        DontSave,
        Cancel,
    }

    /// <summary>
    /// The dialogs the view models need, so they stay free of window code (and testable).
    /// </summary>
    public interface IDialogService
    {
        /// <summary>Returns the chosen song files (.txt or ChordPro), or an empty list if cancelled.</summary>
        IReadOnlyList<string> PickSongsToOpen();

        /// <summary>
        /// Returns the chosen path, or null if cancelled. The file type starts on the one
        /// <paramref name="suggestedFileName"/>'s extension names.
        /// </summary>
        string? PickSavePath(string suggestedFileName, string? initialDirectory);

        /// <summary>Returns the chosen .pdf path, or null if cancelled.</summary>
        string? PickPdfSavePath(string suggestedFileName);

        SaveChoice AskToSave(string songTitle);

        SaveChoice AskToSaveSetlist(string name);

        void ShowError(string title, string message);

        /// <summary>Shows the export window (modal) for the given view model.</summary>
        void ShowExportPdf(ExportPdfViewModel viewModel);

        /// <summary>Returns the chosen .setlist file to import into the library, or null if cancelled.</summary>
        string? PickSetlistToImport();

        /// <summary>Lets the user pick songs from the library; returns them, or an empty list if cancelled.</summary>
        IReadOnlyList<SongSummary> PickLibrarySongs(SongLibrary library);

        /// <summary>Returns the path for a library backup, or null if cancelled.</summary>
        string? PickBackupPath(string suggestedFileName);

        /// <summary>Asks a yes/no question; returns true for yes.</summary>
        bool Confirm(string title, string message);

        /// <summary>Shows the setlist window (modal) for the given view model.</summary>
        void ShowSetlist(SetlistViewModel viewModel);

        /// <summary>Opens a file with its default app (e.g. the PDF viewer).</summary>
        void OpenWithDefaultApp(string path);
    }
}
