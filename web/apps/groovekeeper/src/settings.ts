// The options in Settings, one set for the whole app, remembered in this browser. Songs are never changed by them:
// they are only how things are shown (chords, text size) and where exports start (collapse repeats, paper).
import type { ChordStyle } from '@groovekeeper/core';
import { useSyncExternalStore } from 'react';
import type { Paper } from './pdf/layout';

export type TextSize = 'small' | 'normal' | 'large';

export interface Settings {
  /** How chords are written: letters, Do Re Mi, or Roman numerals in the song's key. */
  chords: ChordStyle;
  /** The size of the lyrics and chords in the editor. */
  textSize: TextSize;
  /** Exports start with repeated sections written as "[Chorus] (repeat)". */
  collapseRepeats: boolean;
  /** The paper of an exported PDF. */
  paper: Paper;
}

export const DEFAULT_SETTINGS: Settings = { chords: 'letters', textSize: 'normal', collapseRepeats: true, paper: 'a4' };

/** The editor's text classes for each size: the lyrics, and the chords (a step smaller). */
export const EDITOR_TEXT: Record<TextSize, { lyrics: string; chords: string }> = {
  small: { lyrics: 'text-base', chords: 'text-xs' },
  normal: { lyrics: 'text-lg', chords: 'text-sm' },
  large: { lyrics: 'text-2xl', chords: 'text-lg' },
};

const STORAGE_KEY = 'groovekeeper.settings';

const CHORD_STYLES: readonly ChordStyle[] = ['letters', 'solfege', 'numerals'];
const TEXT_SIZES: readonly TextSize[] = ['small', 'normal', 'large'];
const PAPERS: readonly Paper[] = ['a4', 'letter'];

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.find((option) => option === value) ?? fallback;

/** The settings from the stored text; an option that is missing or isn't valid keeps its default. */
function parse(text: string | null): Settings {
  let stored: Record<string, unknown> = {};
  try {
    const value: unknown = text === null ? null : JSON.parse(text);
    if (typeof value === 'object' && value !== null) stored = value as Record<string, unknown>; // read field by field below
  } catch {
    // Not JSON: the defaults.
  }
  return {
    chords: oneOf(stored.chords, CHORD_STYLES, DEFAULT_SETTINGS.chords),
    textSize: oneOf(stored.textSize, TEXT_SIZES, DEFAULT_SETTINGS.textSize),
    collapseRepeats: typeof stored.collapseRepeats === 'boolean' ? stored.collapseRepeats : DEFAULT_SETTINGS.collapseRepeats,
    paper: oneOf(stored.paper, PAPERS, DEFAULT_SETTINGS.paper),
  };
}

function saved(): Settings {
  try {
    return parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_SETTINGS; // storage blocked (private mode, site data off): the defaults still work
  }
}

let current = saved();
const listeners = new Set<() => void>();

export const getSettings = (): Settings => current;

/** Changes some options, for everything using them, and remembers them. */
export function updateSettings(change: Partial<Settings>): void {
  current = { ...current, ...change };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Not remembered, but applied for this visit.
  }
  listeners.forEach((listener) => listener());
}

/** Back to the defaults (and forgotten): for tests. */
export function resetSettings(): void {
  current = DEFAULT_SETTINGS;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was remembered.
  }
  listeners.forEach((listener) => listener());
}

// Outside the hook, so React doesn't unsubscribe and subscribe again on every render.
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** One option, kept up to date. */
export const useSetting = <K extends keyof Settings>(option: K): Settings[K] =>
  useSyncExternalStore(subscribe, () => current[option]);
