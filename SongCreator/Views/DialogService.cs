using System.Diagnostics;
using System.Windows;
using Microsoft.Win32;
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
        private const string SetlistFilter = "Setlist (*.setlist)|*.setlist";

        public IReadOnlyList<string> PickSongsToOpen()
        {
            var dialog = new OpenFileDialog { Title = "Open song", Filter = TextFilter, Multiselect = true };
            return dialog.ShowDialog(ActiveWindow) == true ? dialog.FileNames : [];
        }

        public string? PickSavePath(string suggestedFileName, string? initialDirectory)
        {
            var dialog = new SaveFileDialog
            {
                Title = "Save song",
                Filter = TextFilter,
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

        public string? PickSetlistToOpen()
        {
            var dialog = new OpenFileDialog { Title = "Open setlist", Filter = SetlistFilter };
            return dialog.ShowDialog(ActiveWindow) == true ? dialog.FileName : null;
        }

        public string? PickSetlistSavePath(string suggestedFileName)
        {
            var dialog = new SaveFileDialog
            {
                Title = "Save setlist",
                Filter = SetlistFilter,
                DefaultExt = ".setlist",
                FileName = suggestedFileName,
            };
            return dialog.ShowDialog(ActiveWindow) == true ? dialog.FileName : null;
        }

        public void ShowSetlist(SetlistViewModel viewModel)
        {
            var window = new SetlistWindow { Owner = owner, DataContext = viewModel };
            window.ShowDialog();
        }

        public void OpenWithDefaultApp(string path) => Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });

        // Dialogs raised from the export window must be owned by it, not the main window behind it.
        private Window ActiveWindow => owner.OwnedWindows.Cast<Window>().FirstOrDefault(w => w.IsActive) ?? owner;

        public void ShowError(string title, string message) =>
            MessageBox.Show(ActiveWindow, message, title, MessageBoxButton.OK, MessageBoxImage.Error);
    }
}
