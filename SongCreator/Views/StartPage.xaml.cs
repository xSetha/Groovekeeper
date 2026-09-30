using System.Windows.Controls;

namespace SongCreator.Views
{
    /// <summary>
    /// Shown while no song is open. Binds to <see cref="ViewModels.MainViewModel"/> (inherited DataContext).
    /// </summary>
    public partial class StartPage : UserControl
    {
        public StartPage()
        {
            InitializeComponent();
        }
    }
}
