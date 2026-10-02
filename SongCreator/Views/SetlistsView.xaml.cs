using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using SongCreator.IO;
using SongCreator.ViewModels;

namespace SongCreator.Views
{
    /// <summary>
    /// View for <see cref="SetlistViewModel"/>: drag and drop (reordering the setlist's songs, adding library songs),
    /// double-clicks, and focusing the name.
    /// </summary>
    public partial class SetlistsView : UserControl
    {
        // Private drag formats, so text boxes don't take the drop as text.
        private const string SetlistSongFormat = "SongCreator.SetlistSong";
        private const string LibrarySongFormat = "SongCreator.LibrarySong";
        // How close to the top or bottom of the song list a drag scrolls it.
        private const double AutoScrollMargin = 24;

        private Point? _dragStart;

        public SetlistsView()
        {
            InitializeComponent();
            DataContextChanged += (_, e) =>
            {
                if (e.OldValue is SetlistViewModel old)
                    old.FocusNameRequested -= ViewModel_FocusNameRequested;
                if (e.NewValue is SetlistViewModel viewModel)
                    viewModel.FocusNameRequested += ViewModel_FocusNameRequested;
            };
        }

        private SetlistViewModel ViewModel => (SetlistViewModel)DataContext;

        private void ViewModel_FocusNameRequested(object? sender, EventArgs e) =>
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, () =>
            {
                NameBox.Focus();
                NameBox.SelectAll();
            });

        private void NameBox_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                NameBox.GetBindingExpression(TextBox.TextProperty)?.UpdateSource();
                e.Handled = true;
            }
        }

        // ---- The setlist's songs: drag to reorder, double-click to edit ----

        private void SongRow_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e) =>
            // The buttons and the key box keep their clicks.
            _dragStart = IsInside<ButtonBase>(e.OriginalSource, sender) || IsInside<ComboBox>(e.OriginalSource, sender)
                ? null
                : e.GetPosition(this);

        private void SongRow_MouseMove(object sender, MouseEventArgs e)
        {
            if (!IsDragging(e))
                return;
            var row = (FrameworkElement)sender;
            DragDrop.DoDragDrop(row, new DataObject(SetlistSongFormat, row.DataContext), DragDropEffects.Move);
        }

        private void SongRow_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ClickCount == 2)
            {
                ViewModel.OpenSongCommand.Execute(((FrameworkElement)sender).DataContext);
                e.Handled = true;
            }
        }

        private void SongList_DragOver(object sender, DragEventArgs e)
        {
            if (e.Data.GetData(SetlistSongFormat) is SetlistItemViewModel item)
            {
                // The song moves while it is dragged, so the list shows where it will land.
                ViewModel.Move(ViewModel.Items.IndexOf(item), RowAt(e, insertBefore: false));
                e.Effects = DragDropEffects.Move;
            }
            else
            {
                e.Effects = e.Data.GetDataPresent(LibrarySongFormat) ? DragDropEffects.Copy : DragDropEffects.None;
            }
            AutoScroll(e);
            e.Handled = true;
        }

        private void SongList_Drop(object sender, DragEventArgs e)
        {
            if (e.Data.GetData(LibrarySongFormat) is SongSummary song)
                ViewModel.AddSong(song, RowAt(e, insertBefore: true));
            e.Handled = true;
        }

        /// <summary>
        /// The row under the mouse (the last one below the list); with <paramref name="insertBefore"/>, the place to
        /// insert at: before the row whose upper half the mouse is over, or at the end.
        /// </summary>
        private int RowAt(DragEventArgs e, bool insertBefore)
        {
            for (int i = 0; i < SongList.Items.Count; i++)
            {
                if (SongList.ItemContainerGenerator.ContainerFromIndex(i) is not FrameworkElement row)
                    continue;
                if (e.GetPosition(row).Y < (insertBefore ? row.ActualHeight / 2 : row.ActualHeight))
                    return i;
            }
            return insertBefore ? SongList.Items.Count : SongList.Items.Count - 1;
        }

        private void AutoScroll(DragEventArgs e)
        {
            double y = e.GetPosition(SongScroll).Y;
            if (y < AutoScrollMargin)
                SongScroll.LineUp();
            else if (y > SongScroll.ActualHeight - AutoScrollMargin)
                SongScroll.LineDown();
        }

        // ---- The library: drag a song into the setlist, or double-click (Enter) to add it at the end ----

        private void LibraryList_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e) =>
            _dragStart = IsInside<ButtonBase>(e.OriginalSource, LibraryList) ? null : e.GetPosition(this);

        private void LibraryList_MouseMove(object sender, MouseEventArgs e)
        {
            if (IsDragging(e) &&
                ItemsControl.ContainerFromElement(LibraryList, (DependencyObject)e.OriginalSource) is ListBoxItem { DataContext: SongSummary song })
                DragDrop.DoDragDrop(LibraryList, new DataObject(LibrarySongFormat, song), DragDropEffects.Copy);
        }

        private void LibraryList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            // Only a double-click on a song, not on the scrollbar or the empty space below the list.
            if (ItemsControl.ContainerFromElement(LibraryList, (DependencyObject)e.OriginalSource) is ListBoxItem &&
                !IsInside<ButtonBase>(e.OriginalSource, LibraryList))
                ViewModel.AddSongCommand.Execute(LibraryList.SelectedItem);
        }

        private void LibraryList_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                ViewModel.AddSongCommand.Execute(LibraryList.SelectedItem);
                e.Handled = true;
            }
        }

        // ---- Helpers ----

        /// <summary>True once the mouse has moved far enough with the button down to start a drag (then only once).</summary>
        private bool IsDragging(MouseEventArgs e)
        {
            if (_dragStart is not Point start || e.LeftButton != MouseButtonState.Pressed)
                return false;
            var moved = e.GetPosition(this) - start;
            if (Math.Abs(moved.X) < SystemParameters.MinimumHorizontalDragDistance &&
                Math.Abs(moved.Y) < SystemParameters.MinimumVerticalDragDistance)
                return false;
            _dragStart = null;
            return true;
        }

        /// <summary>Whether <paramref name="source"/> is inside a <typeparamref name="T"/> that is inside <paramref name="container"/>.</summary>
        private static bool IsInside<T>(object source, object container) where T : DependencyObject
        {
            // Popups (the key list) aren't in the visual tree of their owner, only in its logical tree.
            for (var element = source as DependencyObject; element != null && element != container;
                 element = element is Visual && VisualTreeHelper.GetParent(element) is { } parent ? parent : LogicalTreeHelper.GetParent(element))
            {
                if (element is T)
                    return true;
            }
            return false;
        }
    }
}
