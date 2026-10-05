using SongCreator.IO;
using SongCreator.Services;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    /// <summary>Scripted answers for the dialogs, and a record of what was asked.</summary>
    public class FakeDialogService : IDialogService
    {
        public IReadOnlyList<string> FilesToOpen { get; set; } = [];
        public string? SavePath { get; set; }
        public string? PdfPath { get; set; }
        public string? SetlistToImport { get; set; }
        public IReadOnlyList<SongSummary> LibrarySongsToPick { get; set; } = [];
        public string? BackupPath { get; set; }
        public bool ConfirmAnswer { get; set; } = true;
        public SaveChoice SaveAnswer { get; set; } = SaveChoice.Cancel;

        public List<string> AskedToSave { get; } = [];
        public List<string> AskedForSavePath { get; } = [];
        public List<string> Errors { get; } = [];
        public List<(NotificationKind Kind, string Text)> Notifications { get; } = [];
        public IEnumerable<string> ErrorNotifications => Notifications.Where(n => n.Kind == NotificationKind.Error).Select(n => n.Text);
        public IEnumerable<string> SuccessNotifications => Notifications.Where(n => n.Kind == NotificationKind.Success).Select(n => n.Text);
        public List<string> Confirmations { get; } = [];
        public List<string> Opened { get; } = [];
        public ExportPdfViewModel? ShownExport { get; private set; }

        public IReadOnlyList<string> PickSongsToOpen() => FilesToOpen;

        public string? PickSavePath(string suggestedFileName, string? initialDirectory)
        {
            AskedForSavePath.Add(suggestedFileName);
            return SavePath;
        }

        public SaveChoice AskToSave(string songTitle)
        {
            AskedToSave.Add(songTitle);
            return SaveAnswer;
        }

        public string? PickPdfSavePath(string suggestedFileName) => PdfPath;

        public void ShowError(string title, string message) => Errors.Add(message);

        public void Notify(NotificationKind kind, string title, string message = "") =>
            Notifications.Add((kind, message.Length > 0 ? $"{title}: {message}" : title));

        public void ShowExportPdf(ExportPdfViewModel viewModel) => ShownExport = viewModel;

        public string? PickSetlistToImport() => SetlistToImport;

        public IReadOnlyList<SongSummary> PickLibrarySongs(SongLibrary library) => LibrarySongsToPick;

        public string? PickBackupPath(string suggestedFileName) => BackupPath;

        public bool Confirm(string title, string question, string detail, string confirmText)
        {
            Confirmations.Add($"{question} {detail}");
            return ConfirmAnswer;
        }

        public void OpenWithDefaultApp(string path) => Opened.Add(path);

        /// <summary>What the user does in the Import from Web window (e.g. import some text); nothing if null.</summary>
        public Action<WebImportViewModel>? WebImportAction { get; set; }

        public void ShowWebImport(WebImportViewModel viewModel) => WebImportAction?.Invoke(viewModel);
    }
}
