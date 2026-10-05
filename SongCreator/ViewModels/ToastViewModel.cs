using System.Windows.Input;
using SongCreator.Services;

namespace SongCreator.ViewModels
{
    /// <summary>One toast: what it says, and how long it stays before it hides (null: until closed).</summary>
    public class ToastViewModel(NotificationKind kind, string title, string message, TimeSpan? duration, Action<ToastViewModel> close)
    {
        public NotificationKind Kind { get; } = kind;
        public string Title { get; } = title;
        public string Message { get; } = message;
        public bool HasMessage => Message.Length > 0;
        public TimeSpan? Duration { get; } = duration;
        public ICommand CloseCommand => new RelayCommand(() => close(this));
    }
}
