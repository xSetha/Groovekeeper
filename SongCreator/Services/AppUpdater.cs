using Serilog;
using Velopack;
using Velopack.Sources;

namespace SongCreator.Services
{
    /// <summary>
    /// Keeps an installed Groovekeeper up to date from the GitHub releases. A newer version is downloaded in the
    /// background and installed the next time the app starts, so the songs being edited are never interrupted.
    /// </summary>
    public static class AppUpdater
    {
        private const string RepositoryUrl = "https://github.com/xSetha/SongCreator";

        /// <summary>Returns the version downloaded, or null if there is none (or it couldn't be checked).</summary>
        public static async Task<string?> DownloadUpdateAsync()
        {
            try
            {
                var manager = new UpdateManager(new GithubSource(RepositoryUrl, accessToken: null, prerelease: false));
                if (!manager.IsInstalled)
                    return null;   // run from a build (dotnet run, Visual Studio), not from an installed release

                var update = await manager.CheckForUpdatesAsync();
                if (update == null)
                    return null;
                await manager.DownloadUpdatesAsync(update);
                string version = update.TargetFullRelease.Version.ToString();
                Log.Information("Downloaded update {Version}", version);
                return version;
            }
            catch (Exception ex)
            {
                // Offline, GitHub unreachable or rate-limited: the next start tries again.
                Log.Warning(ex, "Couldn't check for or download an update");
                return null;
            }
        }
    }
}
