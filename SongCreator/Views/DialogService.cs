using System.Diagnostics;
using System.Windows;
using Microsoft.Win32;
using SongCreator.IO;
using SongCreator.Services;
using SongCreator.ViewModels;

namespace SongCreator.Views
{
    /// <summary>
    /// WPF implementation of <see cref="IDialogService"/>; dialogs are owned by <paramref name="owner"/>.
    /// </summary>
    public class DialogService(Window owner) : IDialogService
    {
        private const string TextFilter = "Text file (*.txt)|*.txt";
        private static readonly string ChordProPatterns = string.Join(";", SongFile.ChordProExtensions.Select(e => "*" + e));
        private static readonly string ChordProFilter = $"ChordPro ({ChordProPatterns})|{ChordProPatterns}";
        private static readonly string OpenSongFilter = $"Songs (*.txt;{ChordProPatterns})|*.txt;{ChordProPatterns}|{TextFilter}|{ChordProFilter}";
        private const string SetlistFilter = "Setlist (*.setlist)|*.setlist";

        public IReadOnlyList<string> PickSongsToOpen()
        {
            var dialog = new OpenFileDialog { Title = "Open song", Filter = OpenSongFilter, Multiselect = true };
            return dialog.ShowDialog(ActiveWindow) == true ? dialog.FileNames : [];
        }

        public string? PickSavePath(string suggestedFileName, string? initialDirectory)
        {
            var dialog = new SaveFileDialog
            {
                Title = "Save song",
                Filter = $"{TextFilter}|{ChordProFilter}",
                FilterIndex = SongFile.IsChordPro(suggestedFileName) ? 2 : 1,
                DefaultExt = ".txt",
                FileName = suggestedFileName,
                InitialDirectory = initialDirectory ?? "",
            };
            return dialog.ShowDialog(owner) == true ? dialog.FileName : null;
        }

        public string? PickPdfSavePath(string suggestedFileName)
        {
            var dialog = new SaveFileDialog
            {
                Title = "Export PDF",
                Filter = "PDF document (*.pdf)|*.pdf",
                DefaultExt = ".pdf",
                FileName = suggestedFileName,
            };
            return dialog.ShowDialog(ActiveWindow) == true ? dialog.FileName : null;
        }

        public SaveChoice AskToSave(string songTitle) => SaveChangesDialog.Ask(ActiveWindow, songTitle);

        public SaveChoice AskToSaveSetlist(string name) =>
            SaveChangesDialog.Ask(ActiveWindow, name, "The setlist keeps its songs' order and keys. If you don't save, your changes are lost.");

        public void ShowExportPdf(ExportPdfViewModel viewModel)
        {
            var window = new ExportPdfWindow { Owner = owner, DataContext = viewModel };
            viewModel.Exported += (_, _) => window.Close();
            window.ShowDialog();
        }

        public string? PickSetlistToImport()
        {
            var dialog = new OpenFileDialog { Title = "Import setlist", Filter = SetlistFilter };
            return dialog.ShowDialog(ActiveWindow) == true ? dialog.FileName : null;
        }

        public IReadOnlyList<SongSummary> PickLibrarySongs(SongLibrary library)
        {
            var viewModel = new LibraryViewModel(library, this);
            var window = new LibraryPickerWindow { Owner = ActiveWindow, DataContext = viewModel };
            return window.ShowDialog() == true ? window.PickedSongs : [];
        }

        public string? PickBackupPath(string suggestedFileName)
        {
            var dialog = new SaveFileDialog
            {
                Title = "Back up library",
                Filter = "Library backup (*.db)|*.db",
                DefaultExt = ".db",
                FileName = suggestedFileName,
            };
            return dialog.ShowDialog(owner) == true ? dialog.FileName : null;
        }

        public bool Confirm(string title, string question, string detail, string confirmText) =>
            ConfirmDialog.Ask(ActiveWindow, title, question, detail, confirmText);

        public void ShowSetlist(SetlistViewModel viewModel)
        {
            var window = new SetlistWindow { Owner = owner, DataContext = viewModel };
            window.ShowDialog();
        }

        public void ShowWebImport(WebImportViewModel viewModel)
        {
            var window = new WebImportWindow { Owner = owner, DataContext = viewModel };
            window.ShowDialog();
        }

        public void OpenWithDefaultApp(string path) => Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });

        // Dialogs raised from the export window must be owned by it, not the main window behind it.
        private Window ActiveWindow => owner.OwnedWindows.Cast<Window>().FirstOrDefault(w => w.IsActive) ?? owner;

        public void ShowError(string title, string message) =>
            MessageBox.Show(ActiveWindow, message, title, MessageBoxButton.OK, MessageBoxImage.Error);
    }
}
