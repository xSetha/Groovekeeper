using System.ComponentModel;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
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
        private readonly MainViewModel _viewModel;

        public MainWindow()
        {
            InitializeComponent();
            _viewModel = new MainViewModel(new DialogService(this), OpenLibrary()) { Themes = new ThemesViewModel() };
            _viewModel.FocusTitleRequested += (_, _) => Dispatcher.BeginInvoke(DispatcherPriority.Loaded, () => TitleBox.Focus());
            _viewModel.FocusLineRequested += (_, request) => FocusLine(request.Line, request.Caret);
            _viewModel.FindMatchFound += (_, match) => FindLineControl(this, match.Line)?.BringIntoView();
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
                MessageBox.Show($"Couldn't open the song library at {SongLibrary.DefaultPath}:\n{ex.Message}", "SongCreator",
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
