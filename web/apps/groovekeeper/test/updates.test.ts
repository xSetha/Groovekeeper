// Reloading a tab opened before a deploy, whose files are gone (src/updates.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadWhenFilesAreGone } from '../src/updates';

const reload = vi.fn();
reloadWhenFilesAreGone(reload);

/** A file of the app failed to load, as Vite reports it; true when the failure was handled. */
const fileFailed = (): boolean => !window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));

beforeEach(() => {
  reload.mockClear();
  sessionStorage.clear();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('a file of the app that fails to load', () => {
  it('reloads the page once, and lets a second failure soon after show as an error', () => {
    expect(fileFailed()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    expect(fileFailed()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again a while after the last reload', () => {
    sessionStorage.setItem('groovekeeper.reloadedForUpdate', String(Date.now() - 61_000));
    expect(fileFailed()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('doesn’t reload while offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(fileFailed()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
