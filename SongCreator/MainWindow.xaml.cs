using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Threading;
using SongCreator.Controls;
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
            _viewModel = new MainViewModel(new DialogService(this)) { Themes = new ThemesViewModel() };
            _viewModel.FocusTitleRequested += (_, _) => Dispatcher.BeginInvoke(DispatcherPriority.Loaded, () => TitleBox.Focus());
            _viewModel.FocusLineRequested += (_, request) => FocusLine(request.Line, request.Caret);
            DataContext = _viewModel;

            ThemePopup.CustomPopupPlacementCallback = AlignPopupRight;
            SourceInitialized += (_, _) => ThemeManager.ApplyTitleBar(this);
        }

        private SongDocumentViewModel Document => _viewModel.ActiveDocument!;

        private void Window_Closing(object? sender, CancelEventArgs e) => e.Cancel = !_viewModel.CloseAll();

        private void Exit_Click(object sender, RoutedEventArgs e) => Close();

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
