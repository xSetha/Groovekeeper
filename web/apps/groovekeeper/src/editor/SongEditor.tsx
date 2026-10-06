import {
  ALL_KEYS, createTemplate, displayTitle, hasContent, transposeSong, UNTITLED_TITLE, type Song,
} from '@groovekeeper/core';
import { Fragment, useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ContextMenu, type MenuAt } from '../components/ContextMenu';
import { useCharWidth } from '../components/useCharWidth';
import type { SongNote } from '../library/db';
import { download, songFile, type SongFormat } from '../library/files';
import { deleteSong, saveSong } from '../library/library';
import { useNewSong } from '../navigation';
import { holdOpenSong } from '../sync/account';
import { dismissToast, toast } from '../toasts';
import { addNote, addSection, setArtist, setKey, setTitle, withIds, type KeyedSong } from './edit';
import { NoteLayer } from './Notes';
import { SectionBlock } from './SectionBlock';
import { createEditorStore, EditorContext, useEditor, useEditorStore, type EditorStore } from './store';

// Changes are saved to the library this long after the last one, so typing doesn't write on every key.
const SAVE_DELAY_MS = 400;
// A finger held this long on the song (not on its text) opens the menu that adds a note.
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 8;

interface Props {
  id: string;
  initial: Song;
  /** The notes floating over it. */
  notes?: SongNote[];
  /** A song just made with New song: if it's left without anything in it, it's removed again. */
  isNew?: boolean;
}

/** The song editor: lyrics with their chord rows, and the song's toolbar. Saves as you go. */
export function SongEditor({ id, initial, notes = [], isNew = false }: Props) {
  // A song without sections starts with the usual blank ones, so there are lines to type into.
  const [store] = useState(() =>
    createEditorStore(withIds(initial.sections.length > 0 ? initial : { ...initial, sections: createTemplate().sections }, notes)));
  const save = useAutosave(id, store, isNew);
  // Syncing doesn't replace the song while it's open here.
  useEffect(() => holdOpenSong(id), [id]);
  useShortcuts(store);

  return (
    <EditorContext value={store}>
      <Toolbar id={id} onDelete={save.cancel} onDeleteFailed={save.resume} />
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
  const sectionDrop = useEditor((s) => s.sectionDrop);
  const { edit, editAndFocus, setCaretSection } = store.getState();
  const sectionsBox = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  /** The menu of the song at a spot: Add note here, which puts a note there with the caret in it. */
  function openAddMenu(x: number, y: number) {
    const box = sectionsBox.current?.getBoundingClientRect();
    if (!box) return;
    const column = charWidth > 0 ? (x - box.left) / charWidth : 0;
    const top = y - box.top;
    const add = () => {
      let added = '';
      edit((s) => {
        const result = addNote(s, Math.round(column * 10) / 10, Math.round(top));
        added = result.id;
        return result.song;
      });
      store.getState().setFocusNote(added);
    };
    setMenu({ x, y, items: [{ label: 'Add note here', onSelect: add }] });
  }

  // Text boxes keep the browser's own menu (copy, paste); a chord's right-click removes it, and notes have their own.
  const onTextOrNote = (target: EventTarget) => target instanceof Element && target.closest('input, textarea, [data-note]') !== null;

  function onContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || onTextOrNote(event.target)) return;
    event.preventDefault();
    openAddMenu(event.clientX, event.clientY);
  }

  /** On a touch screen there's no right-click: a long press on the song opens the same menu. */
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' || onTextOrNote(event.target) || (event.target as Element).closest('button')) return;
    const { pointerId, clientX: x, clientY: y } = event;
    const timer = setTimeout(() => {
      stop();
      openAddMenu(x, y);
      // Lifting the finger may still click what's under it (a chord row would open its chord box): not this time.
      const swallow = (click: Event) => {
        click.stopPropagation();
        click.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), LONG_PRESS_MS);
    }, LONG_PRESS_MS);
    const move = (e: globalThis.PointerEvent) =>
      e.pointerId === pointerId && Math.hypot(e.clientX - x, e.clientY - y) > LONG_PRESS_SLOP_PX && stop();
    const end = (e: globalThis.PointerEvent) => e.pointerId === pointerId && stop();
    function stop() {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  useEffect(() => {
    document.title = `${title || UNTITLED_TITLE} – Groovekeeper`;
  }, [title]);

  // The left padding leaves room for the sections' grips, out in the margin.
  return (
    <article aria-label="Song" className="min-h-0 min-w-0 flex-1 overflow-auto py-8 pr-4 pl-10 sm:px-10">
      <input
        value={title}
        aria-label="Title"
        placeholder={UNTITLED_TITLE}
        className="w-full border-0 bg-transparent p-0 text-3xl font-semibold outline-none placeholder:text-hint"
        onFocus={() => setCaretSection(null)}
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
        onFocus={() => setCaretSection(null)}
        onChange={(event) => {
          const value = event.target.value;
          edit((s) => setArtist(s, value), { merge: 'artist' });
        }}
      />
      <div
        ref={sectionsBox}
        className="relative font-mono text-lg"
        data-sections
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
      >
        {sections.map(([sectionId, lineIds], index) => (
          <Fragment key={sectionId}>
            {sectionDrop === index ? <DropLine /> : null}
            <SectionBlock
              index={index}
              lineIds={lineIds}
              first={index === 0}
              last={index === sections.length - 1}
              charWidth={charWidth}
            />
          </Fragment>
        ))}
        {sectionDrop === sections.length ? <DropLine /> : null}
        <NoteLayer charWidth={charWidth} onMenu={setMenu} />
      </div>
      {menu ? <ContextMenu menu={menu} onClose={closeMenu} /> : null}
      <button
        type="button"
        className="mt-6 rounded px-2 py-1 text-sm text-muted hover:bg-hover hover:text-fg pointer-coarse:min-h-11"
        onClick={() => editAndFocus((s) => addSection(s, store.getState().caretSection))}
      >
        + Section
      </button>
    </article>
  );
}

/**
 * Where a section dragged by its grip will land: a line in the gap above the next section, taking no room of its
 * own. The holder is a pixel tall (and a pixel back up): an empty one would let that section's top margin run
 * through it, and the line would land on the section's heading instead of in the gap.
 */
function DropLine() {
  return (
    <div aria-hidden="true" className="relative -mb-px h-px">
      <div className="absolute inset-x-0 top-3 h-0.5 rounded bg-accent" />
    </div>
  );
}

function Toolbar(props: { id: string; onDelete: () => void; onDeleteFailed: () => void }) {
  const { id, onDelete, onDeleteFailed } = props;
  const store = useEditorStore();
  const navigate = useNavigate();
  const newSong = useNewSong();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fileMenu, setFileMenu] = useState<MenuAt | null>(null);
  const closeFileMenu = useCallback(() => setFileMenu(null), []);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const key = useEditor((s) => s.song.key);
  const numerals = useEditor((s) => s.numerals);
  const { edit, undo, redo, setNumerals } = store.getState();

  const saveFile = (format: SongFormat) => {
    const file = songFile(store.getState().song, format);
    download(file.name, file.text);
    const hasNotes = store.getState().song.notes.length > 0;
    toast('success', `Saved ${file.name}`, hasNotes ? 'Its notes stay in the library: song files don’t have them.' : '');
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-toolbar px-4 py-1.5 text-sm">
      <Link to="/" className="py-1.5 text-muted hover:text-fg lg:hidden">
        ← Library
      </Link>
      {/* Beside the library panel on a wide screen; here where the panel is hidden. */}
      <span className="lg:hidden">
        <ToolButton onClick={newSong}>New song</ToolButton>
      </span>
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
      <span className="ml-auto flex items-center gap-1">
        <IconButton
          label="Save as file"
          menuOpen={fileMenu !== null}
          onClick={(button) => {
            if (fileMenu) {
              setFileMenu(null);
              return;
            }
            const box = button.getBoundingClientRect();
            setFileMenu({
              opener: button,
              x: box.left,
              y: box.bottom + 4,
              items: [
                { label: 'Save as .txt', onSelect: () => saveFile('text') },
                { label: 'Save as ChordPro', onSelect: () => saveFile('chordpro') },
              ],
            });
          }}
        >
          {/* An arrow down into a tray: a file to keep. */}
          <ToolIcon d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </IconButton>
        <IconButton label="Export PDF" onClick={() => navigate(`/pdf?song=${id}`)}>
          {/* A printed page. */}
          <ToolIcon d="M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h6" />
        </IconButton>
        <IconButton label="Delete song" onClick={() => setConfirmDelete(true)}>
          {/* A bin, as on a section's Delete. */}
          <ToolIcon d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </IconButton>
      </span>
      {fileMenu ? <ContextMenu menu={fileMenu} onClose={closeFileMenu} /> : null}
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete “${displayTitle(store.getState().song)}”?`}
          message="The song is removed from the library in this browser. This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            onDelete();
            const title = displayTitle(store.getState().song);
            deleteSong(id).then(
              () => {
                toast('success', `Deleted “${title}”`);
                navigate('/');
              },
              () => {
                onDeleteFailed();
                setConfirmDelete(false);
                toast('error', `Couldn't delete “${title}”`, 'Reload the page and try again.');
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}

/** A toolbar action shown as its picture; its name is the tooltip (and what screen readers read). */
function IconButton(props: { label: string; menuOpen?: boolean; onClick: (button: HTMLButtonElement) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      aria-haspopup={props.menuOpen === undefined ? undefined : 'menu'}
      aria-expanded={props.menuOpen}
      onClick={(event) => props.onClick(event.currentTarget)}
      className="inline-flex items-center justify-center rounded p-1.5 text-muted hover:bg-hover hover:text-fg aria-expanded:bg-hover aria-expanded:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
    >
      {props.children}
    </button>
  );
}

function ToolIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
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
 * empty is removed instead. `cancel` drops a pending save and stops saving (when the song is being deleted);
 * `resume` saves again (the delete failed).
 */
function useAutosave(id: string, store: EditorStore, isNew: boolean) {
  const pending = useRef<KeyedSong | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelled = useRef(false);

  useEffect(() => {
    const flush = () => {
      clearTimeout(timer.current);
      const song = pending.current;
      pending.current = null;
      if (!song) return;
      // A song that couldn't be saved mustn't go unnoticed: the toast stays until a save works again.
      saveSong(id, song, song.notes).then(
        () => dismissToast(`save:${id}`),
        () => {
          toast(
            'error',
            `Couldn't save “${displayTitle(song)}”`,
            "Your latest changes aren't stored yet. Free some space on this device, then change the song to save again.",
            `save:${id}`,
          );
          // Saved again with the next change, or when leaving the song.
          pending.current ??= song;
        },
      );
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
    resume: () => {
      cancelled.current = false;
    },
  };
}
