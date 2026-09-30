using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using SongCreator.Controls;

namespace SongCreator.Views
{
    /// <summary>
    /// View for <see cref="ViewModels.ChordPaletteViewModel"/>; its chips are drag sources for chord names.
    /// </summary>
    public partial class ChordPalette : UserControl
    {
        private Point _pressedAt;
        private string? _pressedChord;

        public ChordPalette()
        {
            InitializeComponent();
        }

        private void Chip_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            _pressedChord = ((FrameworkElement)sender).DataContext as string;
            _pressedAt = e.GetPosition(this);
        }

        private void Chip_MouseMove(object sender, MouseEventArgs e)
        {
            if (_pressedChord == null || e.LeftButton != MouseButtonState.Pressed)
                return;
            var moved = e.GetPosition(this) - _pressedAt;
            if (Math.Abs(moved.X) < SystemParameters.MinimumHorizontalDragDistance &&
                Math.Abs(moved.Y) < SystemParameters.MinimumVerticalDragDistance)
                return;

            string chord = _pressedChord;
            _pressedChord = null;
            DragDrop.DoDragDrop((DependencyObject)sender, new DataObject(ChordDrag.Format, chord), DragDropEffects.Copy);
        }
    }
}
