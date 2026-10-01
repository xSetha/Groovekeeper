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
        public string? SetlistToOpen { get; set; }
        public string? SetlistSavePath { get; set; }
        public SaveChoice SaveAnswer { get; set; } = SaveChoice.Cancel;

        public List<string> AskedToSave { get; } = [];
        public List<string> Errors { get; } = [];
        public List<string> Opened { get; } = [];
        public ExportPdfViewModel? ShownExport { get; private set; }
        public SetlistViewModel? ShownSetlist { get; private set; }

        public IReadOnlyList<string> PickSongsToOpen() => FilesToOpen;

        public string? PickSavePath(string suggestedFileName, string? initialDirectory) => SavePath;

        public SaveChoice AskToSave(string songTitle)
        {
            AskedToSave.Add(songTitle);
            return SaveAnswer;
        }

        public SaveChoice AskToSaveSetlist(string name) => AskToSave(name);

        public string? PickPdfSavePath(string suggestedFileName) => PdfPath;

        public void ShowError(string title, string message) => Errors.Add(message);

        public void ShowExportPdf(ExportPdfViewModel viewModel) => ShownExport = viewModel;

        public string? PickSetlistToOpen() => SetlistToOpen;

        public string? PickSetlistSavePath(string suggestedFileName) => SetlistSavePath;

        public void ShowSetlist(SetlistViewModel viewModel) => ShownSetlist = viewModel;

        public void OpenWithDefaultApp(string path) => Opened.Add(path);
    }
}
