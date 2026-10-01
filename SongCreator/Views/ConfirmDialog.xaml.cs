using System.Windows;
using System.Windows.Input;

namespace SongCreator.Views
{
    public partial class ConfirmDialog : Window
    {
        private ConfirmDialog()
        {
            InitializeComponent();
            Loaded += (_, _) => CancelButton.Focus();
        }

        /// <summary>Shows the question; returns true if the user pressed the confirm button.</summary>
        public static bool Ask(Window owner, string title, string question, string detail, string confirmText)
        {
            var dialog = new ConfirmDialog { Owner = owner, Title = title };
            dialog.Question.Text = question;
            dialog.Detail.Text = detail;
            dialog.ConfirmButton.Content = confirmText;
            return dialog.ShowDialog() == true;
        }

        private void Confirm_Click(object sender, RoutedEventArgs e) => DialogResult = true;

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();
    }
}
