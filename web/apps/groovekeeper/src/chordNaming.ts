// How chord names are written: letters (A B C) or Do Re Mi. One choice for the whole app, remembered in this
// browser; songs keep letters whatever it is (it's only how chords are shown, and a second way to type them).
import type { ChordNaming } from '@groovekeeper/core';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'groovekeeper.chordNaming';

function saved(): ChordNaming {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'solfege' ? 'solfege' : 'letters';
  } catch {
    return 'letters'; // storage blocked (private mode, site data off): letters still work
  }
}

let current = saved();
const listeners = new Set<() => void>();

export const chordNaming = (): ChordNaming => current;

export function setChordNaming(naming: ChordNaming): void {
  current = naming;
  try {
    localStorage.setItem(STORAGE_KEY, naming);
  } catch {
    // Not remembered, but applied for this visit.
  }
  listeners.forEach((listener) => listener());
}

// Outside the hook, so React doesn't unsubscribe and subscribe again on every render.
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useChordNaming = (): ChordNaming => useSyncExternalStore(subscribe, () => current);
