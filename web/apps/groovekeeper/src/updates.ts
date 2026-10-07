// New versions of the app. The service worker keeps the app for offline use and finds new versions; the user
// reloads when it suits them, never over an unsaved change. A tab opened before a deploy also asks for the old
// version's files when it loads a page or the Supabase client, and they're gone: it reloads to get the new
// version instead.
import { registerSW } from 'virtual:pwa-register';
import { db } from './library/db';
import { saveAll } from './saving';
import { toast } from './toasts';

// ---- A new version ----

const UPDATE_KEY = 'update';

// Set once the service worker has a new version waiting; reloading then goes through it.
let activateWaitingVersion: (() => Promise<void>) | null = null;

/** Offers to reload. The reload saves first, and doesn't happen when a save failed (its error toast says so). */
function offerUpdate(): void {
  toast('info', 'A new version of Groovekeeper is ready', 'Reload to start using it.', UPDATE_KEY, {
    label: 'Reload',
    run: () =>
      void saveAll().then((saved) => {
        if (!saved) return offerUpdate();
        // The waiting version takes over and every tab reloads (onNeedReload); without one, this tab reloads.
        if (activateWaitingVersion) void activateWaitingVersion();
        else location.reload();
      }),
  });
}

/** Keeps the app for offline use, and offers a reload when a new version is ready. */
export function watchForUpdates(): void {
  // Service workers exist only on HTTPS pages and localhost; on the plain-http address used to test on a
  // phone, this does nothing.
  const update = registerSW({
    onNeedRefresh() {
      activateWaitingVersion = () => update(true);
      offerUpdate();
    },
    // The new version took over, from this tab or another: this tab saves, then reloads. If it can't save,
    // it stays as it is and offers the reload again.
    onNeedReload: () => void saveAll().then((saved) => (saved ? location.reload() : offerUpdate())),
  });
  // A newer version opened in another tab upgrades the library. This tab keeps working (Dexie reopens the
  // library at its new version), but it runs the old app.
  db.on('versionchange', (event) => {
    if (event.newVersion) offerUpdate();
  });
}

// ---- Files gone after a deploy ----

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
    // A change that couldn't be saved isn't reloaded away: the failure shows as an error instead.
    void saveAll().then((saved) => saved && reload());
  });
}
