using System.ComponentModel;
using System.Windows;
using System.Windows.Input;
using SongCreator.ViewModels;

namespace SongCreator.Views
{
    /// <summary>
    /// View for <see cref="SetlistViewModel"/>.
    /// </summary>
    public partial class SetlistWindow : Window
    {
        public SetlistWindow()
        {
            InitializeComponent();
        }

        private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();

        private void Window_Closing(object? sender, CancelEventArgs e) => e.Cancel = !((SetlistViewModel)DataContext).ConfirmClose();
    }
}
