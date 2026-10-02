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

        private readonly MainViewModel _viewModel;
        private SongDocumentViewModel? _watchedDocument;
        // Where a mouse press in the lyrics started, while the button is down.
        private TextPosition? _selectionAnchor;

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
            _selectionAnchor = control != null && FindAncestor<TextBox>(e.OriginalSource as DependencyObject) != null
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
            AutoScrollEditor(e);
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

        private void AutoScrollEditor(MouseEventArgs e)
        {
            double y = e.GetPosition(EditorScroll).Y;
            if (y < AutoScrollMargin)
                EditorScroll.LineUp();
            else if (y > EditorScroll.ActualHeight - AutoScrollMargin)
                EditorScroll.LineDown();
        }

        private void WatchSelection(SongDocumentViewModel? document)
        {
            if (_watchedDocument != null)
                _watchedDocument.PropertyChanged -= Document_PropertyChanged;
            _watchedDocument = document;
            if (document != null)
                document.PropertyChanged += Document_PropertyChanged;
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
