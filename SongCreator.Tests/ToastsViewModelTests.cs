using SongCreator.Services;
using SongCreator.ViewModels;

namespace SongCreator.Tests
{
    public class ToastsViewModelTests
    {
        private readonly ToastsViewModel _toasts = new();

        [Fact]
        public void ShowsAToastWithItsKindAndText()
        {
            _toasts.Show(NotificationKind.Success, "Saved Draft");

            var toast = Assert.Single(_toasts.Items);
            Assert.Equal(NotificationKind.Success, toast.Kind);
            Assert.Equal("Saved Draft", toast.Title);
            Assert.False(toast.HasMessage);
        }

        [Fact]
        public void KeepsOnlyTheNewestThree()
        {
            for (int i = 1; i <= 4; i++)
                _toasts.Show(NotificationKind.Info, $"Toast {i}");

            Assert.Equal(["Toast 2", "Toast 3", "Toast 4"], _toasts.Items.Select(t => t.Title));
        }

        [Fact]
        public void ErrorsArePushedOutLast()
        {
            _toasts.Show(NotificationKind.Error, "Error 1");
            _toasts.Show(NotificationKind.Success, "Saved");
            _toasts.Show(NotificationKind.Error, "Error 2");
            _toasts.Show(NotificationKind.Success, "Imported");

            Assert.Equal(["Error 1", "Error 2", "Imported"], _toasts.Items.Select(t => t.Title));

            _toasts.Show(NotificationKind.Error, "Error 3");
            _toasts.Show(NotificationKind.Error, "Error 4");

            Assert.Equal(["Error 2", "Error 3", "Error 4"], _toasts.Items.Select(t => t.Title));
        }

        [Fact]
        public void DoesNotStackTheSameMessage()
        {
            _toasts.Show(NotificationKind.Error, "Something went wrong", "Boom");
            _toasts.Show(NotificationKind.Error, "Something went wrong", "Boom");
            _toasts.Show(NotificationKind.Error, "Something went wrong", "Bang");

            Assert.Equal(["Boom", "Bang"], _toasts.Items.Select(t => t.Message));
        }

        [Fact]
        public void ErrorsStayUntilClosedAndTheRestHide()
        {
            Assert.Null(ToastsViewModel.DurationOf(NotificationKind.Error));
            Assert.Equal(TimeSpan.FromSeconds(4), ToastsViewModel.DurationOf(NotificationKind.Info));
            Assert.Equal(TimeSpan.FromSeconds(4), ToastsViewModel.DurationOf(NotificationKind.Success));
            Assert.Equal(TimeSpan.FromSeconds(6), ToastsViewModel.DurationOf(NotificationKind.Warning));
        }

        [Fact]
        public void CloseRemovesTheToast()
        {
            _toasts.Show(NotificationKind.Warning, "One");
            _toasts.Show(NotificationKind.Warning, "Two");

            _toasts.Items[0].CloseCommand.Execute(null);

            Assert.Equal(["Two"], _toasts.Items.Select(t => t.Title));
        }
    }
}
