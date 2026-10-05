using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using SongCreator.Models;

namespace SongCreator.Controls
{
    /// <summary>
    /// A note floating over the song. DataContext is a <see cref="SongNote"/>; the window places it and saves its moves.
    /// </summary>
    public partial class NoteControl : UserControl
    {
        private Point? _dragFrom;

        public NoteControl()
        {
            InitializeComponent();
        }

        public SongNote Note => (SongNote)DataContext;

        /// <summary>The note is being dragged: how far the mouse moved since the last time.</summary>
        public event EventHandler<Vector>? Dragging;

        /// <summary>The note was let go after a drag.</summary>
        public event EventHandler? Dropped;

        /// <summary>The caret left the note (Enter, or a click elsewhere).</summary>
        public event EventHandler? Finished;

        public event EventHandler? DeleteRequested;

        public void FocusText()
        {
            Box.Focus();
            Box.CaretIndex = Box.Text.Length;
        }

        private void Grip_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            _dragFrom = e.GetPosition(Parent as IInputElement);
            Grip.CaptureMouse();
            e.Handled = true;
        }

        private void Grip_MouseMove(object sender, MouseEventArgs e)
        {
            if (_dragFrom is not Point from)
                return;
            var to = e.GetPosition(Parent as IInputElement);
            _dragFrom = to;
            Dragging?.Invoke(this, to - from);
        }

        private void Grip_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            if (_dragFrom == null)
                return;
            _dragFrom = null;
            Grip.ReleaseMouseCapture();
            Dropped?.Invoke(this, EventArgs.Empty);
            e.Handled = true;
        }

        private void Box_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key != Key.Enter)
                return;
            if (Keyboard.Modifiers.HasFlag(ModifierKeys.Shift))
            {
                int at = Box.SelectionStart;
                Box.SelectedText = "\n";
                Box.CaretIndex = at + 1;
            }
            else
            {
                Keyboard.ClearFocus();   // the caret leaves the note, which finishes it
            }
            e.Handled = true;
        }

        private void Box_LostKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e)
        {
            // Opening the note's own menu takes the focus too; that doesn't finish it.
            if (e.NewFocus is not DependencyObject next || !IsInMenu(next))
                Finished?.Invoke(this, EventArgs.Empty);
        }

        private static bool IsInMenu(DependencyObject element) => element is System.Windows.Controls.ContextMenu or MenuItem;

        private void Delete_Click(object sender, RoutedEventArgs e) => DeleteRequested?.Invoke(this, EventArgs.Empty);
    }
}
