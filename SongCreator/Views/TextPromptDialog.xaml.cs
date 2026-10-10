using System.Windows;
using System.Windows.Input;

namespace SongCreator.Views
{
    public partial class TextPromptDialog : Window
    {
        private Func<string, string?> _problem = _ => null;

        private TextPromptDialog()
        {
            InitializeComponent();
            Loaded += (_, _) =>
            {
                Input.Focus();
                Input.SelectAll();
            };
        }

        /// <summary>Shows the prompt; returns the text the user confirmed, or null if cancelled.</summary>
        public static string? Ask(Window owner, string title, string prompt, string initial, string confirmText, Func<string, string?> problem)
        {
            var dialog = new TextPromptDialog { Owner = owner, Title = title, _problem = problem };
            dialog.Prompt.Text = prompt;
            dialog.ConfirmButton.Content = confirmText;
            dialog.Input.Text = initial;
            return dialog.ShowDialog() == true ? dialog.Input.Text.Trim() : null;
        }

        private void Input_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
        {
            // An untouched empty box isn't scolded; the button just waits.
            string? problem = _problem(Input.Text);
            Problem.Text = Input.Text.Length == 0 ? "" : problem ?? "";
            ConfirmButton.IsEnabled = problem == null;
        }

        private void Input_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter && ConfirmButton.IsEnabled)
                DialogResult = true;
        }

        private void Confirm_Click(object sender, RoutedEventArgs e) => DialogResult = true;

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();
    }
}
