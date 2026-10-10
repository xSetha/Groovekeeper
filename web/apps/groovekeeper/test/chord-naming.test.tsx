import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chordNaming, setChordNaming, useChordNaming } from '../src/chordNaming';

afterEach(() => {
  setChordNaming('letters');
  vi.restoreAllMocks();
});

describe('how chords are written', () => {
  it('starts on letters, switches for everything using it, and is remembered', () => {
    const { result } = renderHook(() => useChordNaming());
    expect(result.current).toBe('letters');

    act(() => setChordNaming('solfege'));

    expect(result.current).toBe('solfege');
    expect(chordNaming()).toBe('solfege');
    expect(localStorage.getItem('groovekeeper.chordNaming')).toBe('solfege');
  });

  it('starts on what was saved', async () => {
    localStorage.setItem('groovekeeper.chordNaming', 'solfege');
    vi.resetModules();

    const fresh = await import('../src/chordNaming');

    expect(fresh.chordNaming()).toBe('solfege');
    localStorage.removeItem('groovekeeper.chordNaming');
  });

  it('still switches when the browser blocks its storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    act(() => setChordNaming('solfege'));

    expect(chordNaming()).toBe('solfege');
  });
});
