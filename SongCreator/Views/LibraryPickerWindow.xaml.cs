using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using SongCreator.IO;
using SongCreator.ViewModels;

namespace SongCreator.Views
{
    /// <summary>
    /// Picks library songs (bound to a <see cref="LibraryViewModel"/>); <see cref="PickedSongs"/> holds them in list order.
    /// </summary>
    public partial class LibraryPickerWindow : Window
    {
        public LibraryPickerWindow()
        {
            InitializeComponent();
            Loaded += (_, _) => SearchBox.Focus();
        }

        public IReadOnlyList<SongSummary> PickedSongs { get; private set; } = [];

        private void Header_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();

        private void Add_Click(object sender, RoutedEventArgs e) => Finish();

        private void SongList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (ItemsControl.ContainerFromElement(SongList, (DependencyObject)e.OriginalSource) is ListBoxItem)
                Finish();
        }

        private void Finish()
        {
            // SelectedItems is in click order; keep the list's order instead.
            PickedSongs = SongList.Items.Cast<SongSummary>().Where(SongList.SelectedItems.Contains).ToList();
            DialogResult = true;
        }
    }
}
