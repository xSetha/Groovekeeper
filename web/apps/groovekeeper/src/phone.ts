import { useSyncExternalStore } from 'react';

/**
 * A phone: a touch screen that is narrow, or short when the phone is turned sideways. Tablets and computers
 * aren't phones. On a phone Groovekeeper only shows the library and reads songs; songs are written on a
 * bigger screen.
 */
export const PHONE_QUERY = '(pointer: coarse) and (max-width: 767px), (pointer: coarse) and (max-height: 500px)';

const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY) : null);

const subscribe = (onChange: () => void) => {
  const list = query();
  list?.addEventListener('change', onChange);
  return () => list?.removeEventListener('change', onChange);
};

/** Whether the app runs on a phone; updates when the window changes (a phone turned sideways stays a phone). */
export const useIsPhone = (): boolean => useSyncExternalStore(subscribe, () => query()?.matches ?? false);
