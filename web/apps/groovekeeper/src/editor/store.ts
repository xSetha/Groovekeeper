// The song being edited, with its undo history, in a store each part of the editor reads only what it
// shows from: typing in a line re-renders that line, not the whole song.
import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { withPrintRows, type Focus, type KeyedSong } from './edit';

// Undo goes back this many steps.
const HISTORY_LIMIT = 200;

export interface EditorState {
  song: KeyedSong;
  past: KeyedSong[];
  future: KeyedSong[];
  /** What the last step edited when the next edit may join it (typing in one line); null otherwise. */
  mergeKey: string | null;
  /** The line to put the caret in; `request` changes each time, so the same place can be asked for again. */
  focus: (Focus & { request: number }) | null;
  /** Show the chords as Roman numerals in the song's key (only how they're shown; the song keeps chord names). */
  numerals: boolean;
  /** The section the caret was last in (its lyrics, a chord or its name), by id; null after the title or artist. */
  caretSection: string | null;
  /** While a section is dragged by its grip: the place it would land, as an index before the move. */
  sectionDrop: number | null;
  /** The note to put the caret in (one just added); `request` changes each time. */
  focusNote: { id: string; request: number } | null;

  /**
   * Changes the song as one undo step. Edits with the same `merge` key in a row make one step (typing in
   * a line); `endStep` makes the next edit start a new one (after typing a space, so undo goes by words).
   */
  edit: (change: (song: KeyedSong) => KeyedSong, options?: { merge?: string; endStep?: boolean }) => void;
  /** An edit that also moves the caret, such as Enter splitting a line. Null from `change` means nothing to do. */
  editAndFocus: (change: (song: KeyedSong) => { song: KeyedSong; focus: Focus } | null) => void;
  undo: () => void;
  redo: () => void;
  setFocus: (focus: Focus) => void;
  setNumerals: (numerals: boolean) => void;
  setCaretSection: (caretSection: string | null) => void;
  setSectionDrop: (sectionDrop: number | null) => void;
  setFocusNote: (id: string) => void;
  /**
   * The rows the notes are over after the editor laid the song out, by note id. They follow the notes and the
   * lines, so they aren't an edit of their own: no undo step (the song is still saved with them).
   */
  relayNotes: (rows: ReadonlyMap<string, number>) => void;
}

export type EditorStore = StoreApi<EditorState>;

export function createEditorStore(song: KeyedSong): EditorStore {
  let requests = 0;
  return createStore<EditorState>((set, get) => ({
    song,
    past: [],
    future: [],
    mergeKey: null,
    focus: null,
    numerals: false,
    caretSection: null,
    sectionDrop: null,
    focusNote: null,

    edit: (change, options = {}) => {
      const { song: current, past, mergeKey } = get();
      const next = change(current);
      if (next === current) return;
      const merging = options.merge !== undefined && options.merge === mergeKey;
      set({
        song: next,
        past: merging ? past : [...past, current].slice(-HISTORY_LIMIT),
        future: [],
        mergeKey: options.endStep ? null : (options.merge ?? null),
      });
    },

    editAndFocus: (change) => {
      let focus: Focus | null = null;
      get().edit((song) => {
        const result = change(song);
        if (!result) return song;
        focus = result.focus;
        return result.song;
      });
      if (focus) get().setFocus(focus);
    },

    undo: () => {
      const { song: current, past, future } = get();
      const previous = past.at(-1);
      if (!previous) return;
      set({ song: previous, past: past.slice(0, -1), future: [current, ...future], mergeKey: null });
    },

    redo: () => {
      const { song: current, past, future } = get();
      const [next, ...rest] = future;
      if (!next) return;
      set({ song: next, past: [...past, current], future: rest, mergeKey: null });
    },

    setFocus: (focus) => set({ focus: { ...focus, request: ++requests } }),
    setNumerals: (numerals) => set({ numerals }),
    setCaretSection: (caretSection) => set({ caretSection }),
    setSectionDrop: (sectionDrop) => set({ sectionDrop }),
    setFocusNote: (id) => set({ focusNote: { id, request: ++requests } }),
    relayNotes: (rows) => {
      const { song } = get();
      const next = withPrintRows(song, rows);
      if (next !== song) set({ song: next });
    },
  }));
}

export const EditorContext = createContext<EditorStore | null>(null);

/** The editor's store, from the SongEditor around the component. */
export function useEditorStore(): EditorStore {
  const store = useContext(EditorContext);
  if (!store) throw new Error('useEditorStore is used outside a SongEditor.');
  return store;
}

/** Reads part of the editor's state; the component re-renders only when that part changes. */
export const useEditor = <T>(select: (state: EditorState) => T): T => useStore(useEditorStore(), select);
