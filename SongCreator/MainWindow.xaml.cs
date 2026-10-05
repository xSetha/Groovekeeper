using System.ComponentModel;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using System.Windows.Threading;
using Microsoft.Data.Sqlite;
using SongCreator.Controls;
using SongCreator.IO;
using SongCreator.Models;
using SongCreator.Themes;
using SongCreator.ViewModels;
using SongCreator.Views;

namespace SongCreator
{
    /// <summary>
    /// View for <see cref="MainViewModel"/>. The code here is purely view work: focus, scrolling,
    /// popup placement, and forwarding line-editing events from <see cref="SongLineControl"/>.
    /// </summary>
    public partial class MainWindow : Window
    {
        // How close to the top or bottom of the editor a selection drag scrolls it.
        private const double AutoScrollMargin = 24;
        // Private drag format for a section, so text boxes don't take the drop as text.
        private const string SectionDragFormat = "Groovekeeper.Section";
        // The space above each section, where the drop line is drawn.
        private const double SectionGap = 16;

        private readonly MainViewModel _viewModel;
        private SongDocumentViewModel? _watchedDocument;
        // Where a mouse press in the lyrics started, while the button is down.
        private TextPosition? _selectionAnchor;
        // Where a section's grip was pressed, until the drag starts or the button goes up.
        private Point? _sectionGripPressedAt;
        // The notes shown over the song, and where the song was last right-clicked (for "Add note here").
        private readonly Dictionary<SongNote, NoteControl> _noteControls = new();
        private Song? _notesSong;
        private Point _rightClickedAt;
        // Where column 0 of the lyrics starts in the note layer, and how wide a letter is.
        private double _columnLeft;
        private double _columnWidth = 1;

        public MainWindow()
        {
            InitializeComponent();
            _viewModel = new MainViewModel(new DialogService(this), OpenLibrary()) { Themes = new ThemesViewModel() };
            _viewModel.FocusTitleRequested += (_, _) => Dispatcher.BeginInvoke(DispatcherPriority.Loaded, () => TitleBox.Focus());
            _viewModel.FocusLineRequested += (_, request) => FocusLine(request.Line, request.Caret);
            _viewModel.FindMatchFound += (_, match) => FindLineControl(this, match.Line)?.BringIntoView();
            _viewModel.PropertyChanged += (_, e) =>
            {
                if (e.PropertyName == nameof(MainViewModel.ActiveDocument))
                    WatchSelection(_viewModel.ActiveDocument);
            };
            DataContext = _viewModel;
            SectionList.LayoutUpdated += (_, _) => UpdateNoteLayout();
            ApplySettings(WindowSettings.Load(WindowSettings.DefaultPath));

            ThemePopup.CustomPopupPlacementCallback = AlignPopupRight;
            SourceInitialized += (_, _) => ThemeManager.ApplyTitleBar(this);
        }

        private SongDocumentViewModel Document => _viewModel.ActiveDocument!;

        /// <summary>Opens the song library; the app can't run without it, so a failure is reported and ends the app.</summary>
        private static SongLibrary OpenLibrary()
        {
            try
            {
                return new SongLibrary(SongLibrary.DefaultPath);
            }
            catch (Exception ex) when (ex is SqliteException or IOException or UnauthorizedAccessException)
            {
                MessageBox.Show($"Couldn't open the song library at {SongLibrary.DefaultPath}:\n{ex.Message}", "Groovekeeper",
                    MessageBoxButton.OK, MessageBoxImage.Error);
                Environment.Exit(1);
                throw;   // not reached
            }
        }

        private void Window_Closing(object? sender, CancelEventArgs e)
        {
            e.Cancel = !_viewModel.CloseAll();
            if (!e.Cancel)
                CurrentSettings().Save(WindowSettings.DefaultPath);
        }

        /// <summary>The remembered size, kept between the minimum size and the screen's work area.</summary>
        private void ApplySettings(WindowSettings settings)
        {
            Width = Math.Clamp(settings.Width, MinWidth, Math.Max(MinWidth, SystemParameters.WorkArea.Width));
            Height = Math.Clamp(settings.Height, MinHeight, Math.Max(MinHeight, SystemParameters.WorkArea.Height));
            _viewModel.IsLibraryPanelOpen = settings.IsLibraryPanelOpen;
        }

        private WindowSettings CurrentSettings()
        {
            // A maximized or minimized window remembers the size it goes back to.
            var size = WindowState == WindowState.Normal ? new Size(ActualWidth, ActualHeight) : RestoreBounds.Size;
            return new WindowSettings(size.Width, size.Height, _viewModel.IsLibraryPanelOpen);
        }

        private void Exit_Click(object sender, RoutedEventArgs e) => Close();

        // ---- Undo, redo and find ----

        // Window-wide, ahead of the text boxes: the song's history replaces their own undo.
        private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (_viewModel.IsEditingSong && Document.Selection != null)
            {
                if (e.Key is Key.Delete or Key.Back)
                {
                    Document.DeleteSelection();
                    e.Handled = true;
                    return;
                }
                // Any other key (but a modifier on its own) ends the selection, and then does what it always does.
                if (e.Key is not (Key.LeftCtrl or Key.RightCtrl or Key.LeftShift or Key.RightShift or Key.LeftAlt or Key.RightAlt or Key.System))
                    Document.ClearSelection();
            }
            if (!_viewModel.IsEditingSong || Keyboard.Modifiers.HasFlag(ModifierKeys.Alt) || !Keyboard.Modifiers.HasFlag(ModifierKeys.Control))
                return;
            bool shift = Keyboard.Modifiers.HasFlag(ModifierKeys.Shift);
            switch (e.Key)
            {
                case Key.Z when !shift && !FindBar.IsKeyboardFocusWithin:
                    Undo_Click(sender, e);
                    break;
                case Key.Y when !shift && !FindBar.IsKeyboardFocusWithin:
                case Key.Z when shift && !FindBar.IsKeyboardFocusWithin:
                    Redo_Click(sender, e);
                    break;
                case Key.F or Key.H when !shift:
                    Find_Click(sender, e);
                    break;
                default:
                    return;
            }
            e.Handled = true;
        }

        private void Undo_Click(object sender, RoutedEventArgs e) => KeepingCaretLine(Document.History.Undo);

        private void Redo_Click(object sender, RoutedEventArgs e) => KeepingCaretLine(Document.History.Redo);

        // Undo replaces the song's lines, so put the caret back in the line at the same place.
        private void KeepingCaretLine(Action change)
        {
            Document.ClearSelection();
            var control = FindAncestor<SongLineControl>(Keyboard.FocusedElement as DependencyObject);
            var lines = Document.Song.Sections.SelectMany(s => s.Lines).ToList();
            int index = control?.DataContext is SongLine line ? lines.IndexOf(line) : -1;
            int caret = control?.Caret ?? 0;

            change();

            lines = Document.Song.Sections.SelectMany(s => s.Lines).ToList();
            if (index >= 0 && lines.Count > 0)
                FocusLine(lines[Math.Min(index, lines.Count - 1)], caret);
        }

        private void Find_Click(object sender, RoutedEventArgs e)
        {
            Document.Find.IsOpen = true;
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, () =>
            {
                FindBox.Focus();
                FindBox.SelectAll();
            });
        }

        private static T? FindAncestor<T>(DependencyObject? element) where T : DependencyObject
        {
            while (element != null && element is not T)
                element = element is Visual ? VisualTreeHelper.GetParent(element) : LogicalTreeHelper.GetParent(element);
            return element as T;
        }

        private void TabStrip_SelectionChanged(object sender, SelectionChangedEventArgs e) => EditorScroll.ScrollToTop();

        // The theme button sits at the window's right edge, so open its popup leftwards.
        private static CustomPopupPlacement[] AlignPopupRight(Size popupSize, Size targetSize, Point offset) =>
            [new CustomPopupPlacement(new Point(targetSize.Width - popupSize.Width + 16, targetSize.Height - 10), PopupPrimaryAxis.Horizontal)];

        // ---- Selecting across lines ----
        // Each line is its own text box, which selects only within the line. Once a drag leaves the line it started
        // in, the editor takes the mouse over and selects the lyrics in between (Document.Selection).

        private void EditorScroll_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            Document.ClearSelection();
            // Only a press in the lyrics: chord tags have a drag of their own.
            var control = FindAncestor<SongLineControl>(e.OriginalSource as DependencyObject);
            _selectionAnchor = control != null && control.IsInLyrics(e.OriginalSource)
                ? new TextPosition(LineOf(control), control.IndexAt(e.GetPosition(control)))
                : null;
        }

        private void EditorScroll_PreviewMouseMove(object sender, MouseEventArgs e)
        {
            if (_selectionAnchor is not { } anchor || e.LeftButton != MouseButtonState.Pressed || LineControlAt(e) is not { } control)
                return;
            var active = new TextPosition(LineOf(control), control.IndexAt(e.GetPosition(control)));
            if (Document.Selection == null)
            {
                if (active.Line == anchor.Line)
                    return;   // the line's text box is selecting
                // Take the drag over from the text box, and drop the selection it started.
                EditorScroll.CaptureMouse();
                FindLineControl(this, anchor.Line)?.FocusText(anchor.Index);
            }
            Document.Select(anchor, active);
            AutoScrollEditor(e.GetPosition(EditorScroll).Y);
        }

        private void EditorScroll_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            _selectionAnchor = null;
            if (EditorScroll.IsMouseCaptured)
                EditorScroll.ReleaseMouseCapture();
        }

        /// <summary>The line at the mouse's height: the last one starting above it (so a heading counts as the line before).</summary>
        private SongLineControl? LineControlAt(MouseEventArgs e)
        {
            var controls = LineControls().ToList();
            return controls.LastOrDefault(control => e.GetPosition(control).Y >= 0) ?? controls.FirstOrDefault();
        }

        /// <summary>Scrolls the editor while a drag is near its top or bottom (<paramref name="y"/> from its top).</summary>
        private void AutoScrollEditor(double y)
        {
            if (y < AutoScrollMargin)
                EditorScroll.LineUp();
            else if (y > EditorScroll.ActualHeight - AutoScrollMargin)
                EditorScroll.LineDown();
        }

        private void WatchSelection(SongDocumentViewModel? document)
        {
            if (_watchedDocument != null)
            {
                _watchedDocument.PropertyChanged -= Document_PropertyChanged;
                _watchedDocument.FocusNoteRequested -= Document_FocusNoteRequested;
            }
            _watchedDocument = document;
            if (document != null)
            {
                document.PropertyChanged += Document_PropertyChanged;
                document.FocusNoteRequested += Document_FocusNoteRequested;
            }
            ShowNotes(document?.Song);
            // Wait for the editor to show the song's lines.
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, ShowSelection);
        }

        private void Document_PropertyChanged(object? sender, PropertyChangedEventArgs e)
        {
            if (e.PropertyName == nameof(SongDocumentViewModel.Selection))
                ShowSelection();
        }

        /// <summary>Marks the selected part of each line, and the section headings the selection would delete.</summary>
        private void ShowSelection()
        {
            var selection = _viewModel.ActiveDocument?.Selection;
            var lines = _viewModel.ActiveDocument?.Song.Sections.SelectMany(s => s.Lines).ToList() ?? [];
            int first = selection == null ? -1 : lines.IndexOf(selection.Start.Line);
            int last = selection == null ? -1 : lines.IndexOf(selection.End.Line);
            foreach (var control in LineControls())
            {
                int index = lines.IndexOf(LineOf(control));
                if (selection == null || index < first || index > last)
                    control.HideSelection();
                else
                    control.ShowSelection(index == first ? selection.Start.Index : 0, index == last ? selection.End.Index : null);
            }

            var deletedSections = _viewModel.ActiveDocument?.SectionsInSelection ?? [];
            for (int i = 0; i < SectionList.Items.Count; i++)
            {
                // A section the editor hasn't laid out yet (it was hidden until now) has no heading to mark yet.
                if (SectionList.ItemContainerGenerator.ContainerFromIndex(i) is DependencyObject container &&
                    FindDescendants<Rectangle>(container).FirstOrDefault(r => r.Name == "HeadingSelection") is { } mark)
                    mark.Visibility = deletedSections.Contains(SectionList.Items[i]) ? Visibility.Visible : Visibility.Collapsed;
            }
        }

        private IEnumerable<SongLineControl> LineControls() => FindDescendants<SongLineControl>(SectionList);

        private static IEnumerable<T> FindDescendants<T>(DependencyObject parent) where T : DependencyObject
        {
            for (int i = 0; i < VisualTreeHelper.GetChildrenCount(parent); i++)
            {
                var child = VisualTreeHelper.GetChild(parent, i);
                if (child is T match)
                    yield return match;
                else
                    foreach (var descendant in FindDescendants<T>(child))
                        yield return descendant;
            }
        }

        // ---- The caret's section, for + Section ----

        // Buttons taking the focus (such as + Section itself) don't change it.
        private void EditorScroll_GotKeyboardFocus(object sender, KeyboardFocusChangedEventArgs e)
        {
            // A note isn't in a section: typing in one leaves the caret's section as it was.
            if (e.NewFocus is not TextBox box || FindAncestor<NoteControl>(box) != null)
                return;
            if (FindAncestor<SongLineControl>(box) is { } control)
                Document.SetCaret(LineOf(control));   // the lyrics, or a chord being typed
            else
                Document.CaretSection = box.DataContext as Section;   // a section's name; null for the title and artist
        }

        // ---- Dragging a section by its grip ----

        private void SectionGrip_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            _sectionGripPressedAt = e.GetPosition(this);
            ((UIElement)sender).CaptureMouse();   // the grip is small: keep following the mouse once it leaves
            e.Handled = true;
        }

        private void SectionGrip_MouseMove(object sender, MouseEventArgs e)
        {
            if (_sectionGripPressedAt is not Point start || e.LeftButton != MouseButtonState.Pressed)
                return;
            var moved = e.GetPosition(this) - start;
            if (Math.Abs(moved.X) < SystemParameters.MinimumHorizontalDragDistance &&
                Math.Abs(moved.Y) < SystemParameters.MinimumVerticalDragDistance)
                return;

            var grip = (FrameworkElement)sender;
            _sectionGripPressedAt = null;
            grip.ReleaseMouseCapture();
            DragDrop.DoDragDrop(grip, new DataObject(SectionDragFormat, grip.DataContext), DragDropEffects.Move);
            SectionDropLine.Visibility = Visibility.Collapsed;   // dropped, or let go somewhere else
        }

        private void SectionGrip_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            _sectionGripPressedAt = null;
            ((UIElement)sender).ReleaseMouseCapture();
        }

        // Preview events: the lyric text boxes would otherwise turn the drag away as "not text".
        private void SectionList_PreviewDragOver(object sender, DragEventArgs e)
        {
            if (!e.Data.GetDataPresent(SectionDragFormat))
                return;
            ShowSectionDropLine(SectionInsertIndex(e));
            AutoScrollEditor(e.GetPosition(EditorScroll).Y);
            e.Effects = DragDropEffects.Move;
            e.Handled = true;
        }

        private void SectionList_PreviewDrop(object sender, DragEventArgs e)
        {
            if (e.Data.GetData(SectionDragFormat) is not Section section)
                return;
            SectionDropLine.Visibility = Visibility.Collapsed;
            Document.MoveSectionTo(section, SectionInsertIndex(e));
            e.Handled = true;
        }

        /// <summary>Where a dropped section goes: before the section whose upper half the mouse is over, or at the end.</summary>
        private int SectionInsertIndex(DragEventArgs e)
        {
            for (int i = 0; i < SectionList.Items.Count; i++)
            {
                if (SectionList.ItemContainerGenerator.ContainerFromIndex(i) is FrameworkElement container &&
                    e.GetPosition(container).Y < container.ActualHeight / 2)
                    return i;
            }
            return SectionList.Items.Count;
        }

        /// <summary>Draws the drop line in the gap above the section at <paramref name="index"/>, or below the last one.</summary>
        private void ShowSectionDropLine(int index)
        {
            bool atEnd = index >= SectionList.Items.Count;
            if (SectionList.ItemContainerGenerator.ContainerFromIndex(atEnd ? index - 1 : index) is not FrameworkElement section)
                return;
            double y = section.TranslatePoint(new Point(0, (atEnd ? section.ActualHeight : 0) + SectionGap / 2), SectionList).Y;
            SectionDropLine.Margin = new Thickness(0, y - SectionDropLine.Height / 2, 0, 0);
            SectionDropLine.Visibility = Visibility.Visible;
        }

        // ---- Notes floating over the song ----

        private void ShowNotes(Song? song)
        {
            if (_notesSong != null)
                _notesSong.Notes.CollectionChanged -= Notes_CollectionChanged;
            NoteLayer.Children.Clear();
            _noteControls.Clear();
            _notesSong = song;
            if (song == null)
                return;
            song.Notes.CollectionChanged += Notes_CollectionChanged;
            foreach (var note in song.Notes)
                AddNoteControl(note);
        }

        private void Notes_CollectionChanged(object? sender, System.Collections.Specialized.NotifyCollectionChangedEventArgs e)
        {
            foreach (SongNote note in e.OldItems ?? Array.Empty<object>())
            {
                if (_noteControls.Remove(note, out var control))
                    NoteLayer.Children.Remove(control);
            }
            foreach (SongNote note in e.NewItems ?? Array.Empty<object>())
                AddNoteControl(note);
        }

        private void AddNoteControl(SongNote note)
        {
            var control = new NoteControl { DataContext = note };
            control.Dragging += (_, by) =>
            {
                Canvas.SetLeft(control, Canvas.GetLeft(control) + by.X);
                Canvas.SetTop(control, Canvas.GetTop(control) + by.Y);
            };
            control.Dropped += (_, _) =>
                Document.MoveNote(note, (Canvas.GetLeft(control) - _columnLeft) / _columnWidth, Canvas.GetTop(control));
            control.Finished += (_, _) => _viewModel.ActiveDocument?.FinishNote(note);
            control.DeleteRequested += (_, _) => Document.DeleteNoteCommand.Execute(note);
            _noteControls[note] = control;
            NoteLayer.Children.Add(control);
            PlaceNote(note, control);
        }

        private void PlaceNote(SongNote note, NoteControl control)
        {
            Canvas.SetLeft(control, _columnLeft + note.Column * _columnWidth);
            Canvas.SetTop(control, note.Top);
        }

        private void Document_FocusNoteRequested(object? sender, SongNote note) =>
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, () =>
            {
                if (_noteControls.TryGetValue(note, out var control))
                    control.FocusText();
            });

        private void EditorScroll_PreviewMouseRightButtonDown(object sender, MouseButtonEventArgs e) =>
            _rightClickedAt = e.GetPosition(NoteLayer);

        // From the menu of a line, or of the space around the sections: the note goes where the song was right-clicked.
        private void AddNoteHere_Click(object sender, EventArgs e) =>
            _viewModel.AddNote(Document, (_rightClickedAt.X - _columnLeft) / _columnWidth, _rightClickedAt.Y);

        /// <summary>
        /// After every layout of the song: where its columns are (for the notes and the edge of the printed page), and
        /// what each note is over now, for the PDF. Only values that changed are set, so this doesn't lay out again.
        /// </summary>
        private void UpdateNoteLayout()
        {
            if (!_viewModel.IsEditingSong)
                return;
            var lines = LineControls().ToList();
            if (lines.Count > 0)
            {
                _columnLeft = lines[0].ColumnLeft(NoteLayer);
                _columnWidth = Math.Max(1, lines[0].ColumnWidth);
            }
            SetIfChanged(PageEdge, FrameworkElement.MarginProperty,
                new Thickness(_columnLeft + SongPdfWriter.PrintedColumns * _columnWidth, 0, 0, 0));

            var tops = lines.Select(line => (line.TranslatePoint(new Point(), NoteLayer).Y, line.ActualHeight)).ToList();
            double right = 0, bottom = 0;
            foreach (var (note, control) in _noteControls)
            {
                note.PrintRow = SongNote.RowAt(tops, note.Top);
                if (!control.IsMouseCaptureWithin)   // not while it's being dragged
                    PlaceNote(note, control);
                right = Math.Max(right, Canvas.GetLeft(control) + control.ActualWidth);
                bottom = Math.Max(bottom, Canvas.GetTop(control) + control.ActualHeight);
            }
            // Notes past the end of the song or to its right can still be scrolled to.
            SetIfChanged(NoteLayer, MinWidthProperty, Math.Ceiling(right));
            SetIfChanged(NoteLayer, MinHeightProperty, Math.Ceiling(bottom));
        }

        private static void SetIfChanged(DependencyObject element, DependencyProperty property, object value)
        {
            if (!Equals(element.GetValue(property), value))
                element.SetValue(property, value);
        }

        // ---- Line editing events → active document ----

        private static SongLine LineOf(object? sender) => (SongLine)((FrameworkElement)sender!).DataContext;

        private void Line_SplitRequested(object? sender, int caret) => Document.SplitLine(LineOf(sender), caret);

        private void Line_MergeRequested(object? sender, EventArgs e) => Document.MergeWithPrevious(LineOf(sender));

        private void Line_MoveFocusRequested(object? sender, int direction) =>
            Document.MoveFocus(LineOf(sender), direction, ((SongLineControl)sender!).Caret);

        private void Line_PasteLinesRequested(object? sender, PastedLines pasted) =>
            Document.PasteLines(LineOf(sender), pasted.Caret, pasted.Text);

        // ---- Focus ----

        private void FocusLine(SongLine line, int caret)
        {
            // Wait for the ItemsControl to generate the control for a newly added line.
            Dispatcher.BeginInvoke(DispatcherPriority.Loaded, () => FindLineControl(this, line)?.FocusText(caret));
        }

        private static SongLineControl? FindLineControl(DependencyObject parent, SongLine line)
        {
            for (int i = 0; i < VisualTreeHelper.GetChildrenCount(parent); i++)
            {
                var child = VisualTreeHelper.GetChild(parent, i);
                if (child is SongLineControl control && control.DataContext == line)
                    return control;
                if (FindLineControl(child, line) is { } found)
                    return found;
            }
            return null;
        }
    }
}
