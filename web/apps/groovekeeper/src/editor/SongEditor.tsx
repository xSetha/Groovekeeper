import {
  ALL_KEYS, createTemplate, detectKey, displayTitle, hasContent, transposeKey, transposeSong, UNTITLED_TITLE, type Song,
} from '@groovekeeper/core';
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useCharWidth } from '../components/useCharWidth';
import { download, songFile, type SongFormat } from '../library/files';
import { deleteSong, saveSong } from '../library/library';
import { ChordPalette } from './ChordPalette';
import { trackDrag } from '../components/drag';
import { addSection, allChords, findLine, placeChord, setArtist, setKey, setTitle, withIds } from './edit';
import { SectionBlock } from './SectionBlock';
import { createEditorStore, EditorContext, useEditor, useEditorStore, type EditorStore } from './store';

// Changes are saved to the library this long after the last one, so typing doesn't write on every key.
const SAVE_DELAY_MS = 400;

interface Props {
  id: string;
  initial: Song;
  /** A song just made with New song: if it's left without anything in it, it's removed again. */
  isNew?: boolean;
}

/** The song editor: lyrics with their chord rows, a chord palette, and the song's toolbar. Saves as you go. */
export function SongEditor({ id, initial, isNew = false }: Props) {
  // A song without sections (a new one: the saved text leaves out sections with nothing in them) starts
  // with the usual blank ones, so there are lines to type into.
  const [store] = useState(() =>
    createEditorStore(withIds(initial.sections.length > 0 ? initial : { ...initial, sections: createTemplate().sections })));
  const save = useAutosave(id, store, isNew);
  useShortcuts(store);

  return (
    <EditorContext value={store}>
      <Toolbar id={id} onDelete={save.cancel} />
      <EditorBody />
    </EditorContext>
  );
}

function EditorBody() {
  const store = useEditorStore();
  const charWidth = useCharWidth('text-lg');
  const title = useEditor((s) => s.song.title);
  const artist = useEditor((s) => s.song.artist);
  // The song's shape (sections and their lines, by id) as one string: this part re-renders only when lines
  // or sections are added, removed or moved, not on every key.
  const shape = useEditor((s) =>
    s.song.sections.map((section) => `${section.id}:${section.lines.map((l) => l.id).join(',')}`).join('|'));
  const sections = shape ? shape.split('|').map((part) => part.split(':') as [string, string]) : [];
  const [ghost, setGhost] = useState<{ name: string; x: number; y: number } | null>(null);
  const { edit, editAndFocus, setDrop } = store.getState();

  useEffect(() => {
    document.title = `${title || UNTITLED_TITLE} – Groovekeeper`;
  }, [title]);

  /** The line under the pointer, and the column the pointer is over. */
  function dropTarget(x: number, y: number) {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-line-id]');
    if (!row?.dataset.lineId || charWidth <= 0) return null;
    return { lineId: row.dataset.lineId, column: Math.max(0, Math.floor((x - row.getBoundingClientRect().left) / charWidth)) };
  }

  function startPaletteDrag(name: string, event: PointerEvent<HTMLButtonElement>) {
    // A mouse press would otherwise start selecting text.
    if (event.pointerType === 'mouse') event.preventDefault();
    trackDrag(event, {
      onMove: (e) => {
        setGhost({ name, x: e.clientX, y: e.clientY });
        setDrop(dropTarget(e.clientX, e.clientY));
      },
      onEnd: (e) => {
        const target = e && dropTarget(e.clientX, e.clientY);
        if (target) {
          edit((s) => {
            const at = findLine(s, target.lineId);
            return at ? placeChord(s, at, target.column, name) : s;
          });
          store.setState({ lastPlaced: name });
        }
        setDrop(null);
        setGhost(null);
      },
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <article aria-label="Song" className="min-h-0 min-w-0 flex-1 overflow-auto px-4 py-8 sm:px-10">
        <input
          value={title}
          aria-label="Title"
          placeholder={UNTITLED_TITLE}
          className="w-full border-0 bg-transparent p-0 text-3xl font-semibold outline-none placeholder:text-hint"
          onChange={(event) => {
            const value = event.target.value;
            edit((s) => setTitle(s, value), { merge: 'title' });
          }}
        />
        <input
          value={artist}
          aria-label="Artist"
          placeholder="Artist"
          className="mt-1 w-full border-0 bg-transparent p-0 text-lg text-muted outline-none placeholder:text-hint"
          onChange={(event) => {
            const value = event.target.value;
            edit((s) => setArtist(s, value), { merge: 'artist' });
          }}
        />
        <div className="font-mono text-lg">
          {sections.map(([sectionId, lineIds], index) => (
            <SectionBlock
              key={sectionId}
              index={index}
              lineIds={lineIds}
              first={index === 0}
              last={index === sections.length - 1}
              charWidth={charWidth}
            />
          ))}
        </div>
        <button
          type="button"
          className="mt-6 rounded px-2 py-1 text-sm text-muted hover:bg-hover hover:text-fg pointer-coarse:min-h-11"
          onClick={() => editAndFocus(addSection)}
        >
          + Section
        </button>
      </article>
      <ChordPalette
        onStartDrag={startPaletteDrag}
        className="order-first max-h-40 shrink-0 overflow-y-auto border-b border-line p-4 md:order-last md:max-h-none md:w-64 md:border-b-0 md:border-l"
      />
      {ghost ? (
        <span
          className="pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-full rounded bg-accent-fill px-2 py-1 font-mono text-sm font-semibold text-on-accent shadow-lg"
          style={{ left: ghost.x, top: ghost.y - 18 }}
        >
          {ghost.name}
        </span>
      ) : null}
    </div>
  );
}

function Toolbar({ id, onDelete }: { id: string; onDelete: () => void }) {
  const store = useEditorStore();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const key = useEditor((s) => s.song.key);
  // The chords as a string change only when chords do, so the key isn't worked out again on every key.
  const chords = useEditor((s) => allChords(s.song).join(' '));
  const detected = useMemo(() => detectKey(chords ? chords.split(' ') : []), [chords]);
  const numerals = useEditor((s) => s.numerals);
  const { edit, undo, redo, setNumerals } = store.getState();
  // Suggested only when it sounds different: C# and Db are the same key.
  const suggestion = detected !== null && transposeKey(detected, 0) !== transposeKey(key, 0) ? detected : null;

  const saveFile = (format: SongFormat) => {
    const file = songFile(store.getState().song, format);
    download(file.name, file.text);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-toolbar px-4 py-1.5 text-sm">
      <Link to="/" className="py-1.5 text-muted hover:text-fg lg:hidden">
        ← Library
      </Link>
      <span className="flex items-center gap-1">
        <ToolButton disabled={!canUndo} onClick={undo}>Undo</ToolButton>
        <ToolButton disabled={!canRedo} onClick={redo}>Redo</ToolButton>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-muted">Transpose</span>
        <ToolButton label="Transpose down" onClick={() => edit((s) => transposeSong(s, -1))}>−</ToolButton>
        <ToolButton label="Transpose up" onClick={() => edit((s) => transposeSong(s, 1))}>+</ToolButton>
      </span>
      <label className="flex items-center gap-1.5">
        <span className="text-muted">Key</span>
        <select
          value={ALL_KEYS.includes(key) ? key : ''}
          data-testid="song-key"
          className="rounded border border-line bg-window px-1 py-1 font-semibold pointer-coarse:min-h-11"
          onChange={(event) => {
            const value = event.target.value;
            edit((s) => setKey(s, value));
          }}
        >
          <option value="">–</option>
          {ALL_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      {key ? (
        <button
          type="button"
          aria-pressed={numerals}
          title="Show the chords as Roman numerals in the song's key"
          className="rounded px-2 py-1.5 hover:bg-hover aria-pressed:bg-accent-fill aria-pressed:text-on-accent pointer-coarse:min-h-11"
          onClick={() => setNumerals(!numerals)}
        >
          I IV V
        </button>
      ) : null}
      {suggestion ? (
        <ToolButton onClick={() => edit((s) => setKey(s, suggestion))}>
          <span className="text-muted">The chords suggest </span>
          <span className="font-semibold text-accent">{suggestion}</span>
        </ToolButton>
      ) : null}
      <span className="ml-auto flex items-center gap-1">
        <ToolButton onClick={() => saveFile('text')}>Save as .txt</ToolButton>
        <ToolButton onClick={() => saveFile('chordpro')}>Save as ChordPro</ToolButton>
        <ToolButton onClick={() => setConfirmDelete(true)}>Delete song</ToolButton>
      </span>
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete “${displayTitle(store.getState().song)}”?`}
          message="The song is removed from the library in this browser. This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            onDelete();
            void deleteSong(id).then(() => navigate('/'));
          }}
        />
      ) : null}
    </div>
  );
}

function ToolButton(props: { label?: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="rounded px-2 py-1.5 hover:bg-hover disabled:text-hint disabled:hover:bg-transparent pointer-coarse:min-h-11 pointer-coarse:min-w-11"
    >
      {props.children}
    </button>
  );
}

/** Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo (Cmd on a Mac), instead of the text box's own undo. */
function useShortcuts(store: EditorStore) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        store.getState().undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        store.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);
}

/**
 * Saves the song to the library shortly after each change, and right away when leaving the song, or when
 * the app is hidden (a phone may freeze or close a hidden app without any other warning). A new song left
 * empty is removed instead. `cancel` drops a pending save (when the song is being deleted).
 */
function useAutosave(id: string, store: EditorStore, isNew: boolean) {
  const pending = useRef<Song | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelled = useRef(false);

  useEffect(() => {
    const flush = () => {
      clearTimeout(timer.current);
      if (pending.current) void saveSong(id, pending.current);
      pending.current = null;
    };
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.song === previous.song) return;
      pending.current = state.song;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    });
    const onHidden = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
      if (isNew && !cancelled.current && !hasContent(store.getState().song)) {
        clearTimeout(timer.current);
        void deleteSong(id);
      } else if (!cancelled.current) {
        flush();
      }
    };
  }, [id, store, isNew]);

  return {
    cancel: () => {
      cancelled.current = true;
      clearTimeout(timer.current);
      pending.current = null;
    },
  };
}
