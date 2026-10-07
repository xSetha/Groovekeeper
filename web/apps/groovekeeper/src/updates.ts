// New versions of the app. A tab opened before a deploy asks for the old version's files when it loads a
// page or the Supabase client, and they're gone: it reloads to get the new version instead.

const RELOADED_KEY = 'groovekeeper.reloadedForUpdate';
// A file still missing this soon after reloading for it isn't fixed by reloading again: the error shows.
const RELOAD_AGAIN_AFTER_MS = 60_000;

/** Reloads the page, once, when a file of the app fails to load while the browser is online. */
export function reloadWhenFilesAreGone(reload: () => void = () => location.reload()): void {
  window.addEventListener('vite:preloadError', (event) => {
    // Offline, the reload would only show the browser's error page; the failure shows as an error instead.
    if (!navigator.onLine) return;
    try {
      if (Date.now() - Number(sessionStorage.getItem(RELOADED_KEY)) < RELOAD_AGAIN_AFTER_MS) return;
      sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    } catch {
      return; // storage blocked: it couldn't tell a second failure from the first, so it doesn't reload
    }
    event.preventDefault();
    reload();
  });
}
