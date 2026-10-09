// The check against bots on the account forms: Cloudflare Turnstile, in its managed mode, so most people see
// nothing, or a box that ticks itself. Supabase checks the token it gives (Auth → bot protection), and each
// token works once, for five minutes: the form asks for a new one after every try.
import { useEffect, useRef, useState } from 'react';

interface TurnstileApi {
  render(element: HTMLElement, options: Record<string, unknown>): string;
  reset(widget: string): void;
  remove(widget: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<TurnstileApi> | null = null;

/** Loads Cloudflare's script once; a failed load is tried again next time. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile didn’t start')));
    script.onerror = () => reject(new Error('Turnstile didn’t load'));
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/**
 * Why there's no token: no connection, the check didn't load (an ad blocker, a firewall), it can't run in this
 * browser, or it didn't pass.
 */
export type CheckProblem = 'offline' | 'unavailable' | 'unsupported' | 'failed';

export const CHECK_PROBLEMS: Record<CheckProblem, string> = {
  offline: 'You’re offline. Signing in needs a connection: reload the page once you’re back online.',
  unavailable:
    'The check that keeps bots out didn’t load. If an ad blocker or privacy setting is on, allow challenges.cloudflare.com, then reload the page.',
  unsupported: 'The check that keeps bots out doesn’t work in this browser. Try another browser, or update this one.',
  failed: 'The check that keeps bots out didn’t pass. Reload the page and try again.',
};

/**
 * The check for one form: `box` is where Turnstile shows when it needs to; `token` goes with the form;
 * `renew()` after each try, since a token works once; `waitingForUser` while it asks the user to tick it.
 */
export function useTurnstile() {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [problem, setProblem] = useState<CheckProblem | null>(null);
  const [waitingForUser, setWaitingForUser] = useState(false);

  useEffect(() => {
    let gone = false;
    loadTurnstile().then(
      (turnstile) => {
        if (gone || !box.current) return;
        widget.current = turnstile.render(box.current, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY as string,
          appearance: 'interaction-only',
          callback: (value: string) => {
            setToken(value);
            setProblem(null);
          },
          // A token unused for five minutes runs out; Turnstile fetches a new one by itself.
          'expired-callback': () => setToken(null),
          // A challenge left unanswered: it starts again.
          'timeout-callback': () => {
            setToken(null);
            if (widget.current) turnstile.reset(widget.current);
          },
          'before-interactive-callback': () => setWaitingForUser(true),
          'after-interactive-callback': () => setWaitingForUser(false),
          'unsupported-callback': () => setProblem('unsupported'),
          'error-callback': () => {
            setToken(null);
            setProblem(navigator.onLine ? 'failed' : 'offline');
            return true;
          },
        });
      },
      () => !gone && setProblem(navigator.onLine ? 'unavailable' : 'offline'),
    );
    return () => {
      gone = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  const renew = () => {
    setToken(null);
    if (widget.current) window.turnstile?.reset(widget.current);
  };

  return { box, token, problem, waitingForUser, renew };
}

/**
 * Sends a form's request with the check's token, and fetches a new token after (a token works once).
 * `canSend` is false while there's no token or a request is on its way.
 */
export function useCheckedRequest(check: ReturnType<typeof useTurnstile>) {
  const [busy, setBusy] = useState(false);
  const run = async <T,>(request: (token: string) => Promise<T>): Promise<T | undefined> => {
    if (!check.token) return undefined;
    setBusy(true);
    try {
      return await request(check.token);
    } finally {
      check.renew();
      setBusy(false);
    }
  };
  return { busy, run, canSend: check.token !== null && !busy };
}
