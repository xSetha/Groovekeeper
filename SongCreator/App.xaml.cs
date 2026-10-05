using System.Configuration;
using System.Data;
using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Threading;
using Serilog;
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
        private static readonly string LogPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SongCreator", "logs", "groovekeeper-.log");

        [STAThread]
        private static void Main()
        {
            // First, before any window: handles the installer's and updater's calls and installs a downloaded update.
            VelopackApp.Build().Run();
            StartLog();
            var app = new App();
            app.DispatcherUnhandledException += app.App_DispatcherUnhandledException;
            app.InitializeComponent();
            try
            {
                app.Run();
            }
            finally
            {
                Log.CloseAndFlush();
            }
        }

        protected override void OnStartup(StartupEventArgs e)
        {
            ThemeManager.LoadSaved();
            base.OnStartup(e);
            _ = DownloadUpdateAsync();
        }

        /// <summary>A log file a day, the last week kept; errors nothing else caught are written there.</summary>
        private static void StartLog()
        {
            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Information()
                .WriteTo.File(LogPath, rollingInterval: RollingInterval.Day, retainedFileCountLimit: 7,
                    fileSizeLimitBytes: 1_000_000, rollOnFileSizeLimit: true)
                .CreateLogger();
            Log.Information("Groovekeeper {Version} started",
                Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion);

            // On another thread the app can't be kept running; the error is only logged.
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            {
                Log.Fatal(e.ExceptionObject as Exception, "Unhandled exception (background thread)");
                Log.CloseAndFlush();
            };
            TaskScheduler.UnobservedTaskException += (_, e) =>
            {
                Log.Error(e.Exception, "Unobserved task exception");
                e.SetObserved();
            };
        }

        /// <summary>
        /// An error nothing else caught: it's logged and shown, and the app keeps running so open songs can be saved.
        /// Before the main window is up there is nothing to keep, so the app shows the error and closes.
        /// </summary>
        private void App_DispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
        {
            Log.Error(e.Exception, "Unhandled exception (UI thread)");
            if (MainWindow is MainWindow { IsLoaded: true } window)
            {
                window.Dialogs.Notify(NotificationKind.Error, "Something went wrong",
                    $"{e.Exception.Message} The details are in the error log.");
                e.Handled = true;
                return;
            }
            MessageBox.Show($"Groovekeeper couldn't start:\n{e.Exception.Message}\n\nThe details are in {Path.GetDirectoryName(LogPath)}.",
                "Groovekeeper", MessageBoxButton.OK, MessageBoxImage.Error);
        }

        private async Task DownloadUpdateAsync()
        {
            string? version = await Task.Run(AppUpdater.DownloadUpdateAsync);
            if (version != null && MainWindow is MainWindow window)
                window.Dialogs.Notify(NotificationKind.Info, "Update ready", $"Groovekeeper {version} installs the next time you start the app.");
        }
    }

}
