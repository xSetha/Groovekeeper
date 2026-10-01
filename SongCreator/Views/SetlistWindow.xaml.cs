using System.ComponentModel;
using System.Windows;
using System.Windows.Controls.Primitives;
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

        private void OpenButton_Click(object sender, RoutedEventArgs e)
        {
            var menu = OpenButton.ContextMenu;
            menu.PlacementTarget = OpenButton;
            menu.Placement = PlacementMode.Bottom;
            menu.IsOpen = true;
        }

        private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();

        private void Window_Closing(object? sender, CancelEventArgs e) => e.Cancel = !((SetlistViewModel)DataContext).ConfirmClose();
    }
}
