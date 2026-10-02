using System.Configuration;
using System.Data;
using System.Windows;
using SongCreator.Services;
using SongCreator.Themes;
using Velopack;

namespace SongCreator
{
    /// <summary>
    /// Interaction logic for App.xaml
    /// </summary>
    public partial class App : Application
    {
        [STAThread]
        private static void Main()
        {
            // First, before any window: handles the installer's and updater's calls and installs a downloaded update.
            VelopackApp.Build().Run();
            var app = new App();
            app.InitializeComponent();
            app.Run();
        }

        protected override void OnStartup(StartupEventArgs e)
        {
            ThemeManager.LoadSaved();
            base.OnStartup(e);
            Task.Run(AppUpdater.DownloadUpdateAsync);
        }
    }

}
