// The one thing a guest is told about keeping songs: the first time they add one, a dialog says the songs are
// only in this browser until they create an account. Once per browser.
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { accountStore } from './sync/account';

const SHOWN_KEY = 'groovekeeper.guestWarningShown';

const store = createStore<{ open: boolean }>(() => ({ open: false }));

/** Opens the dialog, unless this browser has shown it before or the songs belong to an account. */
export function warnGuestOnce(): void {
  const { status, endedSession } = accountStore.getState();
  if (status !== 'guest' || endedSession !== null) return;
  try {
    if (localStorage.getItem(SHOWN_KEY) !== null) return;
    localStorage.setItem(SHOWN_KEY, '1');
  } catch {
    // Storage blocked: it can't remember, so it doesn't show (it would show on every song).
    return;
  }
  store.setState({ open: true });
}

export const closeGuestWarning = (): void => store.setState({ open: false });

export const useGuestWarningOpen = (): boolean => useStore(store, (s) => s.open);
