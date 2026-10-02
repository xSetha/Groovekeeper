// The four themes (colors in index.css) and the one in use, remembered in this browser.
import { useSyncExternalStore } from 'react';

export interface Theme {
  id: string;
  name: string;
  description: string;
  /** The toolbar color, for the browser's own bar on phones (the theme-color meta tag). */
  toolbar: string;
}

export const THEMES: readonly Theme[] = [
  { id: 'amp', name: 'Amp', description: 'Black with blood red, like a guitar amp', toolbar: '#161313' },
  { id: 'backstage', name: 'Backstage', description: 'Warm charcoal with brass', toolbar: '#24201d' },
  { id: 'record-sleeve', name: 'Record Sleeve', description: 'Forest green, cream and mustard', toolbar: '#24302a' },
  { id: 'songbook', name: 'Songbook', description: 'Cream paper with red ink chords', toolbar: '#fbf8f2' },
];

// index.html reads the same key to apply the theme before the page is first drawn.
const STORAGE_KEY = 'groovekeeper.theme';
const DEFAULT = THEMES[0]!;

const byId = (id: string | null): Theme => THEMES.find((t) => t.id === id) ?? DEFAULT;

function saved(): Theme {
  try {
    return byId(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT; // storage blocked (private mode, site data off): the default theme still works
  }
}

let current = saved();
const listeners = new Set<() => void>();

function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.toolbar);
}

apply(current);

export function setTheme(id: string): void {
  current = byId(id);
  apply(current);
  try {
    localStorage.setItem(STORAGE_KEY, current.id);
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

export const useTheme = (): Theme => useSyncExternalStore(subscribe, () => current);
