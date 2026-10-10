using System.Collections.Specialized;
using System.ComponentModel;
using System.Globalization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Music;
using SongCreator.Themes;
using SongCreator.ViewModels;

namespace SongCreator.Controls
{
    public record PastedLines(int Caret, string Text);

    /// <summary>
    /// One lyric line with a chord lane above it. DataContext is a <see cref="SongLine"/>.
    /// </summary>
    public partial class SongLineControl : UserControl
    {
        private const double TagPadding = 3;
        // The chord box's border and padding, so its text lines up with the chord tag it replaces.
        private const double ChordBoxInset = 3;

        public event EventHandler<int>? SplitRequested;
        public event EventHandler? MergeRequested;
        public event EventHandler<int>? MoveFocusRequested;
        public event EventHandler<PastedLines>? PasteLinesRequested;

        /// <summary>"Add note here" was chosen from the line's menu; the window knows where the menu was opened.</summary>
        public event EventHandler? AddNoteRequested;

        private SongLine? _line;
        private readonly Dictionary<ChordPlacement, Border> _tags = new();
        private bool _syncingText;
        private double _charWidth;

        private ChordPlacement? _dragChord;
        private Point _dragStart;
        private int _dragStartPosition;
        private bool _dragging;

        private int? _chordColumn;   // where the chord box types a chord, while it is open

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
            // The editor scrolls sideways, not the text box, so keep the caret in view while typing past the edge.
            LyricBox.SelectionChanged += (_, _) =>
            {
                if (LyricBox.IsKeyboardFocused && LyricBox.GetRectFromCharacterIndex(LyricBox.CaretIndex) is { IsEmpty: false } caret)
                    LyricBox.BringIntoView(caret);
            };
            DataObject.AddPastingHandler(LyricBox, OnPaste);
        }

        public int Caret => LyricBox.CaretIndex;

        /// <summary>The song's key, which Roman numerals are counted from.</summary>
        public string SongKey
        {
            get => (string)GetValue(SongKeyProperty);
            set => SetValue(SongKeyProperty, value);
        }

        public static readonly DependencyProperty SongKeyProperty = DependencyProperty.Register(
            nameof(SongKey), typeof(string), typeof(SongLineControl),
            new PropertyMetadata("", (d, _) => ((SongLineControl)d).RenderChords()));

        /// <summary>How chord names are written: letters, Do Re Mi, or Roman numerals in the song's key.</summary>
        public ChordStyle ChordStyle
        {
            get => (ChordStyle)GetValue(ChordStyleProperty);
            set => SetValue(ChordStyleProperty, value);
        }

        public static readonly DependencyProperty ChordStyleProperty = DependencyProperty.Register(
            nameof(ChordStyle), typeof(ChordStyle), typeof(SongLineControl),
            new PropertyMetadata(ChordStyle.Letters, (d, _) => ((SongLineControl)d).RenderChords()));

        /// <summary>Lyric text to highlight (the find bar's search), or empty.</summary>
        public string HighlightText
        {
            get => (string)GetValue(HighlightTextProperty);
            set => SetValue(HighlightTextProperty, value);
        }

        public static readonly DependencyProperty HighlightTextProperty = DependencyProperty.Register(
            nameof(HighlightText), typeof(string), typeof(SongLineControl),
            new PropertyMetadata("", (d, _) => ((SongLineControl)d).RenderHighlights()));

        /// <summary>The find bar's current match: highlighted more strongly when it is in this line.</summary>
        public FindMatch? CurrentMatch
        {
            get => (FindMatch?)GetValue(CurrentMatchProperty);
            set => SetValue(CurrentMatchProperty, value);
        }

        public static readonly DependencyProperty CurrentMatchProperty = DependencyProperty.Register(
            nameof(CurrentMatch), typeof(FindMatch), typeof(SongLineControl),
            new PropertyMetadata(null, (d, _) => ((SongLineControl)d).RenderHighlights()));

        // A theme can change the monospace font, so re-measure columns once the new font is laid out.
        private void OnThemeChanged(object? sender, EventArgs e)
        {
            _charWidth = 0;
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, RenderChords);
        }

        /// <summary>How wide a letter of the lyrics is: columns are counted in these.</summary>
        public double ColumnWidth => CharWidth;

        /// <summary>Where column 0 (the lyrics' first letter) starts, measured in <paramref name="relativeTo"/>.</summary>
        public double ColumnLeft(Visual relativeTo) => TranslatePoint(new Point(ColumnX(0), 0), (UIElement)relativeTo).X;

        /// <summary>Whether <paramref name="source"/> (e.g. where the mouse was pressed) is in the lyrics' text box.</summary>
        public bool IsInLyrics(object source) => source is Visual visual && (visual == LyricBox || LyricBox.IsAncestorOf(visual));

        public void FocusText(int caret)
        {
            LyricBox.Focus();
            LyricBox.CaretIndex = Math.Clamp(caret, 0, LyricBox.Text.Length);
        }

        /// <summary>The place in the lyrics nearest to <paramref name="point"/> (relative to this control): between two letters.</summary>
        public int IndexAt(Point point) =>
            Math.Clamp((int)Math.Round((TranslatePoint(point, Lane).X - Origin) / CharWidth), 0, LyricBox.Text.Length);

        /// <summary>
        /// Shows the lyrics from <paramref name="start"/> to <paramref name="end"/> as selected, with the chords above
        /// them; a null <paramref name="end"/> selects to the end of the line, line break included.
        /// </summary>
        public void ShowSelection(int start, int? end)
        {
            int lineEnd = _line == null ? 0 : _line.Chords.Select(c => c.Position + Display(c).Length).Append(_line.Text.Length).Max();
            int stop = end ?? lineEnd + 1;
            SelectionMark.Margin = new Thickness(ColumnX(start), 0, 0, 0);
            SelectionMark.Width = Math.Max(0, stop - start) * CharWidth;
            SelectionMark.Visibility = Visibility.Visible;
        }

        public void HideSelection() => SelectionMark.Visibility = Visibility.Collapsed;

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

            CloseChordBox();
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
            {
                SyncTextFromModel();
                RenderHighlights();
            }
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
            ((TextBlock)tag.Child).Text = Display(chord);
            Canvas.SetLeft(tag, ColumnX(chord.Position) - TagPadding);
            UpdateWidth();
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
                    Text = Display(chord),
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
                    ToolTip = "Drag to move · Double-click to change · Right-click to delete",
                    Child = label,
                };
                tag.SetResourceReference(Border.BackgroundProperty, "ChordTagBackground");
                Canvas.SetLeft(tag, ColumnX(chord.Position) - TagPadding);
                Canvas.SetTop(tag, 1);
                tag.MouseLeftButtonDown += (_, e) =>
                {
                    if (e.ClickCount == 2)
                    {
                        OpenChordBox(chord.Position, chord.Name);
                        e.Handled = true;
                    }
                    else
                    {
                        StartDrag(tag, chord, e);
                    }
                };
                tag.MouseMove += (_, e) => ContinueDrag(e);
                tag.MouseLeftButtonUp += (_, e) => EndDrag(tag, e);
                tag.MouseRightButtonUp += (_, e) =>
                {
                    _line.Chords.Remove(chord);
                    e.Handled = true;
                };
                _tags[chord] = tag;
                ChordLayer.Children.Add(tag);
            }
            UpdateWidth();
            RenderHighlights();
        }

        /// <summary>
        /// Makes the line at least as wide as its chords: they are drawn on a canvas, which takes no room of its own,
        /// so a chord past the end of the lyrics would otherwise be cut off instead of scrolled to.
        /// </summary>
        private void UpdateWidth()
        {
            int end = _line?.Chords.Select(c => c.Position + Display(c).Length).DefaultIfEmpty(0).Max() ?? 0;
            MinWidth = end > 0 ? ColumnX(end) + 2 * TagPadding : 0;
        }

        private void RenderHighlights()
        {
            HighlightLayer.Children.Clear();
            if (_line == null)
                return;

            foreach (int start in FindReplaceViewModel.MatchesIn(_line.Text, HighlightText))
            {
                bool current = CurrentMatch is { } match && match.Line == _line && match.Start == start;
                var mark = new Rectangle
                {
                    Width = HighlightText.Length * CharWidth,
                    Height = LyricBox.ActualHeight,
                    RadiusX = 2,
                    RadiusY = 2,
                    Opacity = current ? 0.65 : 0.25,
                };
                mark.SetResourceReference(Shape.FillProperty, "AccentFill");
                Canvas.SetLeft(mark, ColumnX(start));
                HighlightLayer.Children.Add(mark);
            }
        }

        // Roman numerals need the key; a song without one keeps its letters, as in the PDF.
        private string Display(ChordPlacement chord) => ChordStyle switch
        {
            ChordStyle.Solfege => NoteNames.ToSolfege(chord.Name),
            ChordStyle.Numerals when RomanNumerals.Of(chord.Name, SongKey) is { } numeral => numeral,
            _ => chord.Name,
        };

        // ---- Typing a chord: a click on the lane, or a double-click on a chord ----

        private void ShowColumnGhost(int column)
        {
            ColumnGhost.Width = CharWidth;
            Canvas.SetLeft(ColumnGhost, ColumnX(column));
            ColumnGhost.Visibility = Visibility.Visible;
        }

        private void Lane_MouseMove(object sender, MouseEventArgs e)
        {
            if (_chordColumn == null)
                ShowColumnGhost(ColumnAt(e.GetPosition(Lane).X));
        }

        private void Lane_MouseLeave(object sender, MouseEventArgs e) => ColumnGhost.Visibility = Visibility.Collapsed;

        // While the chord box is open, a right-click belongs to it rather than to the lane.
        private void Lane_ContextMenuOpening(object sender, ContextMenuEventArgs e) => e.Handled = _chordColumn != null;

        private void AddNote_Click(object sender, RoutedEventArgs e) => AddNoteRequested?.Invoke(this, EventArgs.Empty);

        private void Lane_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            int column = ColumnAt(e.GetPosition(Lane).X);
            OpenChordBox(column, _line?.Chords.FirstOrDefault(c => c.Position == column)?.Name ?? "");
            e.Handled = true;
        }

        private void OpenChordBox(int column, string name)
        {
            if (_line == null)
                return;
            // A click on the lane doesn't take the focus, so finish a chord being typed on this line first.
            if (_chordColumn != null && !CommitChordBox())
                CloseChordBox();

            _chordColumn = column;
            ColumnGhost.Visibility = Visibility.Collapsed;
            SetTagsVisibility(column, Visibility.Hidden);
            ChordEditor.Margin = new Thickness(ColumnX(column) - TagPadding - ChordBoxInset, 0, 0, 0);
            ChordBox.Text = ChordStyle == ChordStyle.Solfege ? NoteNames.ToSolfege(name) : name;   // typed as letters or Do Re Mi
            ShowChordError(false);
            ChordEditor.Visibility = Visibility.Visible;
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, () =>
            {
                ChordBox.Focus();
                ChordBox.SelectAll();
            });
        }

        /// <summary>Places the typed chord (an empty box removes the chord). Returns false, saying why, if it isn't a chord.</summary>
        private bool CommitChordBox()
        {
            if (_line == null || _chordColumn is not int column)
                return true;
            if (!_line.SetChord(column, ChordBox.Text))
            {
                ShowChordError(true);
                return false;
            }
            CloseChordBox();
            return true;
        }

        private void CloseChordBox()
        {
            if (_chordColumn is not int column)
                return;
            _chordColumn = null;   // first: hiding the box takes its focus away, which mustn't commit again
            ChordEditor.Visibility = Visibility.Collapsed;
            SetTagsVisibility(column, Visibility.Visible);
        }

        private void ChordBox_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (_chordColumn is not int column || e.Key is not (Key.Enter or Key.Escape))
                return;
            if (e.Key == Key.Escape)
                CloseChordBox();
            if (_chordColumn == null || CommitChordBox())
                FocusText(column);   // back to the lyrics, under the chord
            e.Handled = true;
        }

        // Clicking away keeps a chord, and drops anything else.
        private void ChordBox_LostKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e)
        {
            if (_chordColumn != null && !CommitChordBox())
                CloseChordBox();
        }

        private void ChordBox_TextChanged(object sender, TextChangedEventArgs e) => ShowChordError(false);

        private void ShowChordError(bool show)
        {
            ChordError.Visibility = show ? Visibility.Visible : Visibility.Collapsed;
            ChordBoxFrame.SetResourceReference(Border.BorderBrushProperty, show ? "ErrorBrush" : "AccentBrush");
        }

        /// <summary>Hides the chord tag the chord box covers (or shows it again).</summary>
        private void SetTagsVisibility(int column, Visibility visibility)
        {
            foreach (var (chord, tag) in _tags)
                if (chord.Position == column)
                    tag.Visibility = visibility;
        }

        // ---- Moving a chord along its line ----

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
            _dragChord = null;
            tag.ReleaseMouseCapture();
            e.Handled = true;
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
