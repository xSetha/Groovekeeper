using System.Windows.Input;

namespace SongCreator.ViewModels
{
    /// <summary>
    /// An always-enabled command that runs a delegate.
    /// </summary>
    public class RelayCommand(Action execute) : ICommand
    {
        public event EventHandler? CanExecuteChanged { add { } remove { } }

        public bool CanExecute(object? parameter) => true;

        public void Execute(object? parameter) => execute();
    }

    /// <summary>
    /// An always-enabled command that runs a delegate with its (typed) CommandParameter.
    /// </summary>
    public class RelayCommand<T>(Action<T> execute) : ICommand
    {
        public event EventHandler? CanExecuteChanged { add { } remove { } }

        public bool CanExecute(object? parameter) => true;

        public void Execute(object? parameter) => execute((T)parameter!);
    }
}
