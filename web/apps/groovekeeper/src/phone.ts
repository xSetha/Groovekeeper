import { useSyncExternalStore } from 'react';

/**
 * A phone: a touch screen that is narrow, or short when the phone is turned sideways. Tablets and computers
 * aren't phones. On a phone Groovekeeper only shows the library and reads songs; songs are written on a
 * bigger screen.
 */
export const PHONE_QUERY = '(pointer: coarse) and (max-width: 767px), (pointer: coarse) and (max-height: 500px)';

const listFor = (media: string): MediaQueryList | null =>
  typeof window.matchMedia === 'function' ? window.matchMedia(media) : null;

/** Whether a CSS media query matches; updates when it changes. */
export function useMediaQuery(media: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = listFor(media);
      list?.addEventListener('change', onChange);
      return () => list?.removeEventListener('change', onChange);
    },
    () => listFor(media)?.matches ?? false,
  );
}

/** Whether the app runs on a phone; updates when the window changes (a phone turned sideways stays a phone). */
export const useIsPhone = (): boolean => useMediaQuery(PHONE_QUERY);
