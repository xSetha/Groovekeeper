using System.Collections.Specialized;
using System.ComponentModel;
using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using SongCreator.Models;
using SongCreator.Themes;

namespace SongCreator.Controls
{
    public record PastedLines(int Caret, string Text);

    /// <summary>
    /// One lyric line with a chord lane above it. DataContext is a <see cref="SongLine"/>.
    /// </summary>
    public partial class SongLineControl : UserControl
    {
        private const double TagPadding = 3;

        public event EventHandler<int>? SplitRequested;
        public event EventHandler? MergeRequested;
        public event EventHandler<int>? MoveFocusRequested;
        public event EventHandler<PastedLines>? PasteLinesRequested;

        private SongLine? _line;
        private readonly Dictionary<ChordPlacement, Border> _tags = new();
        private bool _syncingText;
        private double _charWidth;

        private ChordPlacement? _dragChord;
        private Point _dragStart;
        private int _dragStartPosition;
        private bool _dragging;

        private bool _editing;
        private ChordPlacement? _editingChord;
        private int _editingColumn;

        public SongLineControl()
        {
            InitializeComponent();
            DataContextChanged += OnDataContextChanged;
            Loaded += (_, _) =>
            {
                ThemeManager.ThemeChanged += OnThemeChanged;
                RenderChords();
            };
            Unloaded += (_, _) => ThemeManager.ThemeChanged -= OnThemeChanged;
            LyricBox.SizeChanged += (_, _) => RenderChords();
            DataObject.AddPastingHandler(LyricBox, OnPaste);
        }

        public int Caret => LyricBox.CaretIndex;

        // A theme can change the monospace font, so re-measure columns once the new font is laid out.
        private void OnThemeChanged(object? sender, EventArgs e)
        {
            _charWidth = 0;
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, RenderChords);
        }

        public void FocusText(int caret)
        {
            LyricBox.Focus();
            LyricBox.CaretIndex = Math.Clamp(caret, 0, LyricBox.Text.Length);
        }

        // ---- Model binding ----

        private void OnDataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
        {
            if (_line != null)
            {
                _line.PropertyChanged -= Line_PropertyChanged;
                _line.Chords.CollectionChanged -= Chords_CollectionChanged;
                foreach (var chord in _line.Chords)
                    chord.PropertyChanged -= Chord_PropertyChanged;
            }

            _line = e.NewValue as SongLine;
            if (_line == null)
                return;

            _line.PropertyChanged += Line_PropertyChanged;
            _line.Chords.CollectionChanged += Chords_CollectionChanged;
            foreach (var chord in _line.Chords)
                chord.PropertyChanged += Chord_PropertyChanged;

            SyncTextFromModel();
            RenderChords();
        }

        private void Line_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(SongLine.Text))
                SyncTextFromModel();
        }

        private void SyncTextFromModel()
        {
            if (_line == null || LyricBox.Text == _line.Text)
                return;
            _syncingText = true;
            LyricBox.Text = _line.Text;
            _syncingText = false;
        }

        private void LyricBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (_syncingText || _line == null)
                return;
            foreach (var change in e.Changes)
                _line.ApplyTextChange(change.Offset, change.RemovedLength, change.AddedLength);
            _line.Text = LyricBox.Text;
        }

        private void Chords_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
        {
            if (e.OldItems != null)
                foreach (ChordPlacement chord in e.OldItems)
                    chord.PropertyChanged -= Chord_PropertyChanged;
            if (e.NewItems != null)
                foreach (ChordPlacement chord in e.NewItems)
                    chord.PropertyChanged += Chord_PropertyChanged;
            RenderChords();
        }

        // Updates the existing tag in place so a drag in progress keeps its mouse capture.
        private void Chord_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (sender is not ChordPlacement chord || !_tags.TryGetValue(chord, out var tag))
                return;
            ((TextBlock)tag.Child).Text = chord.Name;
            Canvas.SetLeft(tag, ColumnX(chord.Position) - TagPadding);
        }

        // ---- Column geometry (monospace font) ----

        private double CharWidth
        {
            get
            {
                if (_charWidth <= 0)
                {
                    var text = new FormattedText("M", CultureInfo.CurrentCulture, FlowDirection.LeftToRight,
                        new Typeface(LyricBox.FontFamily, LyricBox.FontStyle, LyricBox.FontWeight, LyricBox.FontStretch),
                        LyricBox.FontSize, Brushes.White, VisualTreeHelper.GetDpi(this).PixelsPerDip);
                    _charWidth = text.WidthIncludingTrailingWhitespace;
                }
                return _charWidth;
            }
        }

        private double Origin
        {
            get
            {
                var rect = LyricBox.GetRectFromCharacterIndex(0);
                if (rect.IsEmpty || double.IsInfinity(rect.X) || double.IsNaN(rect.X))
                    return 2;
                return LyricBox.TranslatePoint(new Point(rect.X, 0), Lane).X;
            }
        }

        private double ColumnX(int column) => Origin + column * CharWidth;

        private int ColumnAt(double x) => Math.Max(0, (int)Math.Floor((x - Origin) / CharWidth));

        // ---- Chord rendering ----

        private void RenderChords()
        {
            foreach (var tag in _tags.Values)
                ChordLayer.Children.Remove(tag);
            _tags.Clear();
            if (_line == null)
                return;

            foreach (var chord in _line.Chords)
            {
                var label = new TextBlock
                {
                    Text = chord.Name,
                    FontSize = 14,
                    FontWeight = FontWeights.Bold,
                };
                label.SetResourceReference(TextBlock.FontFamilyProperty, "SongFont");
                label.SetResourceReference(TextBlock.ForegroundProperty, "ChordTagForeground");
                var tag = new Border
                {
                    CornerRadius = new CornerRadius(3),
                    Padding = new Thickness(TagPadding, 0, TagPadding, 0),
                    Cursor = Cursors.Hand,
                    ToolTip = "Drag to move · Click to rename · Right-click to delete",
                    Child = label,
                };
                tag.SetResourceReference(Border.BackgroundProperty, "ChordTagBackground");
                Canvas.SetLeft(tag, ColumnX(chord.Position) - TagPadding);
                Canvas.SetTop(tag, 1);
                tag.MouseLeftButtonDown += (_, e) => StartDrag(tag, chord, e);
                tag.MouseMove += (_, e) => ContinueDrag(e);
                tag.MouseLeftButtonUp += (_, e) => EndDrag(tag, e);
                tag.MouseRightButtonUp += (_, e) =>
                {
                    _line.Chords.Remove(chord);
                    e.Handled = true;
                };
                _tags[chord] = tag;
                ChordLayer.Children.Insert(0, tag); // keep the editor on top
            }
        }

        // ---- Lane: add chords ----

        private void Lane_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (_line == null)
                return;
            int column = ColumnAt(e.GetPosition(Lane).X);
            BeginEdit(_line.Chords.FirstOrDefault(c => c.Position == column), column);
            e.Handled = true;
        }

        private void Lane_MouseMove(object sender, MouseEventArgs e)
        {
            int column = ColumnAt(e.GetPosition(Lane).X);
            ColumnGhost.Width = CharWidth;
            Canvas.SetLeft(ColumnGhost, ColumnX(column));
            ColumnGhost.Visibility = Visibility.Visible;
        }

        private void Lane_MouseLeave(object sender, MouseEventArgs e)
        {
            ColumnGhost.Visibility = Visibility.Collapsed;
        }

        // ---- Chord drag ----

        private void StartDrag(Border tag, ChordPlacement chord, MouseButtonEventArgs e)
        {
            _dragChord = chord;
            _dragStart = e.GetPosition(Lane);
            _dragStartPosition = chord.Position;
            _dragging = false;
            tag.CaptureMouse();
            e.Handled = true;
        }

        private void ContinueDrag(MouseEventArgs e)
        {
            if (_dragChord == null)
                return;
            double dx = e.GetPosition(Lane).X - _dragStart.X;
            if (!_dragging && Math.Abs(dx) < 3)
                return;
            _dragging = true;
            _dragChord.Position = Math.Max(0, _dragStartPosition + (int)Math.Round(dx / CharWidth));
        }

        private void EndDrag(Border tag, MouseButtonEventArgs e)
        {
            if (_dragChord == null)
                return;
            var chord = _dragChord;
            _dragChord = null;
            tag.ReleaseMouseCapture();
            if (!_dragging)
                BeginEdit(chord, chord.Position);
            e.Handled = true;
        }

        // ---- Chord name editor ----

        private void BeginEdit(ChordPlacement? chord, int column)
        {
            _editing = true;
            _editingChord = chord;
            _editingColumn = column;
            ChordEditor.Text = chord?.Name ?? "";
            Canvas.SetLeft(ChordEditor, ColumnX(column) - TagPadding);
            ChordEditor.Visibility = Visibility.Visible;
            ChordEditor.Focus();
            ChordEditor.SelectAll();
        }

        private void EndEdit(bool commit)
        {
            if (!_editing || _line == null)
                return;
            _editing = false;
            ChordEditor.Visibility = Visibility.Collapsed;
            if (!commit)
                return;

            string name = ChordEditor.Text.Trim();
            if (_editingChord != null)
            {
                if (name.Length == 0)
                    _line.Chords.Remove(_editingChord);
                else
                    _editingChord.Name = name;
            }
            else if (name.Length > 0)
            {
                _line.Chords.Add(new ChordPlacement(_editingColumn, name));
            }
        }

        private void ChordEditor_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key is Key.Enter or Key.Escape)
            {
                EndEdit(commit: e.Key == Key.Enter);
                FocusText(_editingColumn);
                e.Handled = true;
            }
        }

        private void ChordEditor_LostKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e)
        {
            EndEdit(commit: true);
        }

        // ---- Lyric keyboard handling ----

        private void LyricBox_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            switch (e.Key)
            {
                case Key.Enter:
                    LyricBox.SelectedText = "";
                    SplitRequested?.Invoke(this, LyricBox.CaretIndex);
                    e.Handled = true;
                    break;
                case Key.Back when LyricBox.CaretIndex == 0 && LyricBox.SelectionLength == 0:
                    MergeRequested?.Invoke(this, EventArgs.Empty);
                    e.Handled = true;
                    break;
                case Key.Up:
                    MoveFocusRequested?.Invoke(this, -1);
                    e.Handled = true;
                    break;
                case Key.Down:
                    MoveFocusRequested?.Invoke(this, 1);
                    e.Handled = true;
                    break;
            }
        }

        private void OnPaste(object sender, DataObjectPastingEventArgs e)
        {
            if (e.DataObject.GetData(DataFormats.UnicodeText) is not string text || !text.Contains('\n'))
                return;
            e.CancelCommand();
            LyricBox.SelectedText = "";
            PasteLinesRequested?.Invoke(this, new PastedLines(LyricBox.CaretIndex, text));
        }
    }
}
