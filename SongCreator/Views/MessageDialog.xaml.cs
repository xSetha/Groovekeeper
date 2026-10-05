using System.Windows;
using System.Windows.Input;

namespace SongCreator.Views
{
    public partial class MessageDialog : Window
    {
        private MessageDialog()
        {
            InitializeComponent();
            Loaded += (_, _) => OkButton.Focus();
        }

        /// <summary>Shows <paramref name="heading"/> with <paramref name="detail"/> below it, until the user presses OK.</summary>
        public static void Show(Window owner, string title, string heading, string detail)
        {
            var dialog = new MessageDialog { Owner = owner, Title = title };
            dialog.Heading.Text = heading;
            dialog.Detail.Text = detail;
            dialog.ShowDialog();
        }

        private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();
    }
}
