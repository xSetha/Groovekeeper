using System.Windows;
using System.Windows.Input;

namespace SongCreator.Views
{
    /// <summary>
    /// View for <see cref="ViewModels.SettingsWindowViewModel"/>.
    /// </summary>
    public partial class SettingsWindow : Window
    {
        public SettingsWindow()
        {
            InitializeComponent();
        }

        private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();
    }
}
