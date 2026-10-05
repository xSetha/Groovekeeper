using System.Collections.ObjectModel;
using SongCreator.Services;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// The toasts shown in the corner of the main window, oldest first. The view hides each one after its
    /// <see cref="ToastViewModel.Duration"/>; errors stay until closed.
    /// </summary>
    public class ToastsViewModel
    {
        public const int MaxShown = 3;

        public ObservableCollection<ToastViewModel> Items { get; } = [];

        public void Show(NotificationKind kind, string title, string message = "")
        {
            // The same message again (e.g. an error that keeps happening) isn't stacked.
            if (Items.Any(t => t.Kind == kind && t.Title == title && t.Message == message))
                return;
            // Errors don't hide on their own, so they make way last: the oldest other toast goes first.
            if (Items.Count == MaxShown)
                Items.Remove(Items.FirstOrDefault(t => t.Kind != NotificationKind.Error) ?? Items[0]);
            Items.Add(new ToastViewModel(kind, title, message, DurationOf(kind), Dismiss));
        }

        public void Dismiss(ToastViewModel toast) => Items.Remove(toast);

        public static TimeSpan? DurationOf(NotificationKind kind) => kind switch
        {
            NotificationKind.Info or NotificationKind.Success => TimeSpan.FromSeconds(4),
            NotificationKind.Warning => TimeSpan.FromSeconds(6),
            _ => null,
        };
    }
}
