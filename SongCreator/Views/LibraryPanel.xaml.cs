using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using SongCreator.ViewModels;

namespace SongCreator.Views
{
    /// <summary>
    /// View for <see cref="LibraryViewModel"/>: turns a double-click or Enter on a song into its open command.
    /// </summary>
    public partial class LibraryPanel : UserControl
    {
        /// <summary>Hides the panel; set only where the panel can be hidden. The hide button shows once it is.</summary>
        public static readonly DependencyProperty HideCommandProperty = DependencyProperty.Register(
            nameof(HideCommand), typeof(ICommand), typeof(LibraryPanel),
            new PropertyMetadata(null, (d, e) =>
                ((LibraryPanel)d).HideButton.Visibility = e.NewValue == null ? Visibility.Collapsed : Visibility.Visible));

        public LibraryPanel()
        {
            InitializeComponent();
        }

        public ICommand? HideCommand
        {
            get => (ICommand?)GetValue(HideCommandProperty);
            set => SetValue(HideCommandProperty, value);
        }

        private void Switcher_Click(object sender, RoutedEventArgs e)
        {
            var library = (LibraryViewModel)DataContext;
            var menu = new ContextMenu { PlacementTarget = SwitcherButton, Placement = System.Windows.Controls.Primitives.PlacementMode.Bottom };
            foreach (var option in library.Options)
                menu.Items.Add(new MenuItem
                {
                    Header = option.Name, IsCheckable = true, IsChecked = option.IsCurrent,
                    Command = library.SwitchCommand, CommandParameter = option,
                });
            menu.Items.Add(new Separator());
            menu.Items.Add(new MenuItem { Header = "New library…", Command = library.NewLibraryCommand });
            menu.Items.Add(new MenuItem { Header = "Rename…", Command = library.RenameLibraryCommand });
            menu.Items.Add(new MenuItem { Header = "Delete…", Command = library.DeleteLibraryCommand, IsEnabled = library.CanDeleteLibrary });
            menu.IsOpen = true;
        }

        private void SongList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            // Only a double-click on a song, not on the scrollbar or the empty space below the list.
            if (ItemsControl.ContainerFromElement(SongList, (DependencyObject)e.OriginalSource) is ListBoxItem)
                OpenSelected();
        }

        private void SongList_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                OpenSelected();
                e.Handled = true;
            }
        }

        private void OpenSelected()
        {
            if (SongList.SelectedItem != null)
                ((LibraryViewModel)DataContext).OpenCommand.Execute(SongList.SelectedItem);
        }
    }
}
