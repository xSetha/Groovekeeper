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

        /// <summary>A modal error, for problems the user must act on (e.g. a song that couldn't be saved).</summary>
        void ShowError(string title, string message);

        /// <summary>A toast in the corner of the main window; errors and warnings become a modal while a dialog is open.</summary>
        void Notify(NotificationKind kind, string title, string message = "");

        /// <summary>Shows the export window (modal) for the given view model.</summary>
        void ShowExportPdf(ExportPdfViewModel viewModel);

        /// <summary>Returns the chosen .setlist file to import into the library, or null if cancelled.</summary>
        string? PickSetlistToImport();

        /// <summary>Lets the user pick songs from the library; returns them, or an empty list if cancelled.</summary>
        IReadOnlyList<SongSummary> PickLibrarySongs(SongLibrary library);

        /// <summary>Returns the path for a library backup, or null if cancelled.</summary>
        string? PickBackupPath(string suggestedFileName);

        /// <summary>
        /// Asks before doing something (e.g. deleting): <paramref name="question"/> as the heading, <paramref name="detail"/>
        /// below it, and a button labelled <paramref name="confirmText"/>. Returns true if the user pressed it.
        /// </summary>
        bool Confirm(string title, string question, string detail, string confirmText);

        /// <summary>
        /// Asks for a line of text (e.g. a name), starting with <paramref name="initial"/>. <paramref name="problem"/> says why a
        /// text can't be used (or returns null); the OK button waits until it returns null. Returns the text, or null if cancelled.
        /// </summary>
        string? AskText(string title, string prompt, string initial, string confirmText, Func<string, string?> problem);

        /// <summary>Shows the Import from Web window (modal) for the given view model.</summary>
        void ShowWebImport(WebImportViewModel viewModel);

        /// <summary>Opens a file with its default app (e.g. the PDF viewer).</summary>
        void OpenWithDefaultApp(string path);
    }
}
