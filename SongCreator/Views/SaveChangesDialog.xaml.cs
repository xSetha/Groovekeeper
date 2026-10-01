using System.Windows;
using System.Windows.Input;
using SongCreator.Services;

namespace SongCreator.Views
{
    public partial class SaveChangesDialog : Window
    {
        private SaveChoice _choice = SaveChoice.Cancel;

        private SaveChangesDialog(string songTitle)
        {
            InitializeComponent();
            SongTitle.Text = songTitle;
        }

        /// <param name="detail">Replaces the text about saving a song (e.g. for a setlist).</param>
        public static SaveChoice Ask(Window owner, string songTitle, string? detail = null)
        {
            var dialog = new SaveChangesDialog(songTitle) { Owner = owner };
            if (detail != null)
                dialog.Detail.Text = detail;
            dialog.ShowDialog();
            return dialog._choice;
        }

        private void Save_Click(object sender, RoutedEventArgs e) => CloseWith(SaveChoice.Save);

        private void DontSave_Click(object sender, RoutedEventArgs e) => CloseWith(SaveChoice.DontSave);

        private void CloseWith(SaveChoice choice)
        {
            _choice = choice;
            Close();
        }

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();
    }
}
