using System.Windows;
using System.Windows.Input;

namespace SongCreator.Views
{
    /// <summary>
    /// View for <see cref="ViewModels.ExportPdfViewModel"/>.
    /// </summary>
    public partial class ExportPdfWindow : Window
    {
        public ExportPdfWindow()
        {
            InitializeComponent();
        }

        private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();
    }
}
