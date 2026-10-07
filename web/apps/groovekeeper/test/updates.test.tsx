// New versions of the app (src/updates.ts): the offer to reload when one is ready, saving first, and reloading a
// tab opened before a deploy, whose files are gone.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toasts } from '../src/components/Toasts';
import { saveBeforeLeaving } from '../src/saving';
import { clearToasts } from '../src/toasts';

// The service worker's registration, as vite-plugin-pwa gives it; here the test says when an update is ready.
const pwa = vi.hoisted(() => ({ needRefresh: () => {}, update: vi.fn() }));
vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: { onNeedRefresh: () => void }) => {
    pwa.needRefresh = options.onNeedRefresh;
    return pwa.update;
  },
}));

const { reloadWhenFilesAreGone, watchForUpdates } = await import('../src/updates');

const reload = vi.fn();
reloadWhenFilesAreGone(reload);
watchForUpdates();

/** A file of the app failed to load, as Vite reports it; true when the failure was handled. */
const fileFailed = (): boolean => !window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));

beforeEach(() => {
  reload.mockClear();
  pwa.update.mockClear();
  clearToasts();
  sessionStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('a new version', () => {
  it('is offered with a Reload button that stays, and reloads only after what is being edited is saved', async () => {
    let saved = false;
    const unregister = saveBeforeLeaving(async () => {
      await new Promise((done) => setTimeout(done, 10));
      saved = true;
      return true;
    });

    render(<Toasts />);
    act(() => pwa.needRefresh());
    expect(screen.getByRole('status')).toHaveTextContent('A new version of Groovekeeper is ready');

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(saved).toBe(false);
    expect(pwa.update).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(pwa.update).toHaveBeenCalledWith(true));
    expect(saved).toBe(true);
    unregister();
  });

  it('doesn’t reload when a change couldn’t be saved, and offers the reload again', async () => {
    const unregister = saveBeforeLeaving(async () => false);
    render(<Toasts />);
    act(() => pwa.needRefresh());

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(await screen.findByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(pwa.update).not.toHaveBeenCalled();
    unregister();
  });
});

describe('a file of the app that fails to load', () => {
  it('reloads the page once, and lets a second failure soon after show as an error', async () => {
    expect(fileFailed()).toBe(true);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));

    expect(fileFailed()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again a while after the last reload', async () => {
    sessionStorage.setItem('groovekeeper.reloadedForUpdate', String(Date.now() - 61_000));
    expect(fileFailed()).toBe(true);
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('doesn’t reload while offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(fileFailed()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
