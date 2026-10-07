import { useState } from 'react';
import { Link } from 'react-router';

// Closed for good once the browser has promised to keep the site's data; otherwise only for this visit, since
// the songs can still be cleared (Safari clears a site's data after 7 days without a visit).
const CLOSED_KEY = 'groovekeeper.guestNoteClosed';

function closedBefore(): boolean {
  try {
    return localStorage.getItem(CLOSED_KEY) !== null || sessionStorage.getItem(CLOSED_KEY) !== null;
  } catch {
    return false;
  }
}

/** In Safari on an iPhone or iPad (iPadOS says it's a Mac, but one with a touch screen), not in the installed app. */
const safariOnAppleTouchDevice = (): boolean =>
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)) &&
  !matchMedia('(display-mode: standalone)').matches;

/** For guests with songs: the songs are only in this browser, so an account keeps them safe. */
export function GuestNote() {
  const [closed, setClosed] = useState(closedBefore);
  if (closed) return null;

  const close = () => {
    setClosed(true);
    // The library asks the browser to keep it when the first songs are added (library.ts); this only reads the answer.
    void Promise.resolve(navigator.storage?.persisted?.())
      .catch(() => false)
      .then((kept) => {
        try {
          (kept ? localStorage : sessionStorage).setItem(CLOSED_KEY, '1');
        } catch {
          // Not remembered: it shows again next time the library does.
        }
      });
  };

  return (
    <div role="note" className="mt-3 flex items-start gap-2 rounded border border-line bg-window px-3 py-2 text-sm">
      <p className="min-w-0 flex-1">
        These songs are only in this browser.{' '}
        {safariOnAppleTouchDevice() ? 'The app added to the Home Screen keeps its own songs, apart from Safari’s. ' : null}
        <Link to="/account" state={{ create: true }} className="text-accent hover:underline">
          Create an account
        </Link>{' '}
        to keep them safe.
      </p>
      <button
        type="button"
        aria-label="Close"
        className="-my-1 -mr-2 rounded px-2 py-1 text-muted hover:bg-hover hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        onClick={close}
      >
        ×
      </button>
    </div>
  );
}
