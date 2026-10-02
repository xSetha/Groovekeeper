using Velopack;
using Velopack.Sources;

namespace SongCreator.Services
{
    /// <summary>
    /// Keeps an installed SongCreator up to date from the GitHub releases. A newer version is downloaded in the
    /// background and installed the next time the app starts, so the songs being edited are never interrupted.
    /// </summary>
    public static class AppUpdater
    {
        private const string RepositoryUrl = "https://github.com/xSetha/SongCreator";

        public static async Task DownloadUpdateAsync()
        {
            try
            {
                var manager = new UpdateManager(new GithubSource(RepositoryUrl, accessToken: null, prerelease: false));
                if (!manager.IsInstalled)
                    return;   // run from a build (dotnet run, Visual Studio), not from an installed release

                var update = await manager.CheckForUpdatesAsync();
                if (update != null)
                    await manager.DownloadUpdatesAsync(update);
            }
            catch (Exception)
            {
                // Offline, GitHub unreachable or rate-limited: the next start tries again.
            }
        }
    }
}
