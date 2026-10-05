using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using SongCreator.ViewModels;

namespace SongCreator.Views
{
    /// <summary>
    /// Shows <see cref="ToastsViewModel.Items"/>. Each toast hides after its duration, fading out; the mouse over it
    /// stops the clock (and the fade), which starts again from the beginning when the mouse leaves.
    /// </summary>
    public partial class ToastHost : UserControl
    {
        private readonly Dictionary<FrameworkElement, DispatcherTimer> _timers = new();

        public ToastHost()
        {
            InitializeComponent();
        }

        private void Toast_Loaded(object sender, RoutedEventArgs e)
        {
            var card = (FrameworkElement)sender;
            if (card.DataContext is not ToastViewModel { Duration: { } duration } || _timers.ContainsKey(card))
                return;

            var timer = new DispatcherTimer { Interval = duration };
            timer.Tick += (_, _) => FadeOut(card);
            _timers[card] = timer;
            card.Unloaded += (_, _) =>
            {
                timer.Stop();
                _timers.Remove(card);
            };
            if (!card.IsMouseOver)
                timer.Start();
        }

        private void Toast_MouseEnter(object sender, MouseEventArgs e)
        {
            var card = (FrameworkElement)sender;
            if (_timers.TryGetValue(card, out var timer))
            {
                timer.Stop();
                card.BeginAnimation(OpacityProperty, null);   // a fade already under way stops, and the toast stays
            }
        }

        private void Toast_MouseLeave(object sender, MouseEventArgs e)
        {
            if (_timers.TryGetValue((FrameworkElement)sender, out var timer))
                timer.Start();
        }

        private void FadeOut(FrameworkElement card)
        {
            _timers[card].Stop();
            var fade = new DoubleAnimation(0, TimeSpan.FromSeconds(0.2));
            fade.Completed += (_, _) =>
            {
                if (card.DataContext is ToastViewModel toast && DataContext is ToastsViewModel toasts)
                    toasts.Dismiss(toast);
            };
            card.BeginAnimation(OpacityProperty, fade);
        }
    }
}
