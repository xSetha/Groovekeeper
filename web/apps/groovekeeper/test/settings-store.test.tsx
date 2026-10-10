import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, getSettings, resetSettings, updateSettings, useSetting } from '../src/settings';

afterEach(() => {
  resetSettings();
  vi.restoreAllMocks();
});

describe('the options in Settings', () => {
  it('start on the defaults, change for everything using them, and are remembered', () => {
    const { result } = renderHook(() => useSetting('chords'));
    expect(result.current).toBe('letters');
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);

    act(() => updateSettings({ chords: 'solfege', paper: 'letter' }));

    expect(result.current).toBe('solfege');
    expect(getSettings().paper).toBe('letter');
    expect(JSON.parse(localStorage.getItem('groovekeeper.settings')!)).toEqual({ ...DEFAULT_SETTINGS, chords: 'solfege', paper: 'letter' });
  });

  it('start on what was saved, keeping the defaults for an option that is missing or not valid', async () => {
    localStorage.setItem('groovekeeper.settings', JSON.stringify({ chords: 'numerals', textSize: 'huge', collapseRepeats: 'yes', paper: 'letter' }));
    vi.resetModules();

    const fresh = await import('../src/settings');

    expect(fresh.getSettings()).toEqual({ ...DEFAULT_SETTINGS, chords: 'numerals', paper: 'letter' });
  });

  it.each(['not json', '[1,2]', 'null', '7'])('start on the defaults when what was saved is %j', async (saved) => {
    localStorage.setItem('groovekeeper.settings', saved);
    vi.resetModules();

    const fresh = await import('../src/settings');

    expect(fresh.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('still change when the browser blocks its storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    act(() => updateSettings({ textSize: 'large' }));

    expect(getSettings().textSize).toBe('large');
  });
});
