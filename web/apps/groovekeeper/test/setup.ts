import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { clearToasts } from '../src/toasts';

// The warning a guest sees on their first song (src/guestWarning.ts) counts as seen, except in its own tests.
beforeEach(() => {
  if (typeof window !== 'undefined') localStorage.setItem('groovekeeper.guestWarningShown', '1');
});

afterEach(() => {
  cleanup();
  clearToasts();
});

// Turnstile, the check against bots on the account forms, stands in for Cloudflare's script: it passes at once,
// and gives a new token after each reset.
let issued = 0;
const widgets = new Map<string, (token: string) => void>();
// Not in tests that run without a browser (deploy.test.ts).
if (typeof window !== 'undefined') window.turnstile = {
  render(_element, options) {
    const id = `widget-${widgets.size + 1}`;
    const pass = options.callback as (token: string) => void;
    widgets.set(id, pass);
    queueMicrotask(() => pass(`test-token-${++issued}`));
    return id;
  },
  reset(id) {
    const pass = widgets.get(id);
    queueMicrotask(() => pass?.(`test-token-${++issued}`));
  },
  remove(id) {
    widgets.delete(id);
  },
};
