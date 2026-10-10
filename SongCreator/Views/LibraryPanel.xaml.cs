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
