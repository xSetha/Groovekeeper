// Short messages in the corner of the window: they confirm what was done (a PDF exported, songs imported) and
// report what went wrong, so the user isn't stopped by a box to close. As on the desktop: errors stay until
// closed, anything else goes after a few seconds, and at most three are shown.
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

export type ToastKind = 'success' | 'info' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message: string;
  /** Names a toast that something can take away again, such as "couldn't save" once a save works. */
  key?: string;
}

const MAX_SHOWN = 3;
// How long a toast that isn't an error stays.
const SHOWN_MS = 4000;

const store = createStore<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let lastId = 0;

/** Shows a toast. The same one again (an error that keeps happening) isn't stacked. */
export function toast(kind: ToastKind, title: string, message = '', key?: string): void {
  const { toasts } = store.getState();
  if (toasts.some((t) => t.kind === kind && t.title === title && t.message === message)) return;
  const shown = toasts.filter((t) => key === undefined || t.key !== key);
  // Errors don't go on their own, so they make way last: the oldest other toast goes first.
  if (shown.length === MAX_SHOWN) {
    const leaving = shown.find((t) => t.kind !== 'error') ?? shown[0]!;
    shown.splice(shown.indexOf(leaving), 1);
  }
  const id = ++lastId;
  store.setState({ toasts: [...shown, { id, kind, title, message, key }] });
  if (kind !== 'error') setTimeout(() => dismissToast(id), SHOWN_MS);
}

/** Takes a toast away: by its id, or every toast with this key. */
export function dismissToast(which: number | string): void {
  const { toasts } = store.getState();
  const left = toasts.filter((t) => (typeof which === 'number' ? t.id !== which : t.key !== which));
  if (left.length !== toasts.length) store.setState({ toasts: left });
}

/**
 * An error nothing else caught doesn't stop the app: it's shown as a toast, and the songs open can still be
 * saved (the browser's console has the details). An error event without an error is another site's script
 * ("Script error."), and the ResizeObserver note is the browser's own; neither is reported.
 */
export function reportUncaughtErrors(target: Window = window): void {
  target.addEventListener('error', (event) => {
    if (event.error === undefined || event.error === null || /ResizeObserver loop/.test(event.message)) return;
    toast('error', 'Something went wrong', messageOf(event.error));
  });
  target.addEventListener('unhandledrejection', (event) => {
    console.error(event.reason);
    toast('error', 'Something went wrong', messageOf(event.reason));
  });
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Every toast away (for tests, which share the module). */
export const clearToasts = (): void => store.setState({ toasts: [] });

export const useToasts = (): Toast[] => useStore(store, (s) => s.toasts);
