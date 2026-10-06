import {
  ALL_KEYS, createTemplate, displayTitle, hasContent, transposeSong, UNTITLED_TITLE, type Song,
} from '@groovekeeper/core';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useCharWidth } from '../components/useCharWidth';
import { download, songFile, type SongFormat } from '../library/files';
import { deleteSong, saveSong } from '../library/library';
import { useNewSong } from '../navigation';
import { holdOpenSong } from '../sync/account';
import { dismissToast, toast } from '../toasts';
import { addSection, setArtist, setKey, setTitle, withIds } from './edit';
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

/** The song editor: lyrics with their chord rows, and the song's toolbar. Saves as you go. */
export function SongEditor({ id, initial, isNew = false }: Props) {
  // A song without sections starts with the usual blank ones, so there are lines to type into.
  const [store] = useState(() =>
    createEditorStore(withIds(initial.sections.length > 0 ? initial : { ...initial, sections: createTemplate().sections })));
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
      <div className="font-mono text-lg" data-sections>
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
      </div>
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

/** Where a section dragged by its grip will land: a line in the gap between sections, taking no room of its own. */
function DropLine() {
  return (
    <div aria-hidden="true" className="relative">
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
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const key = useEditor((s) => s.song.key);
  const numerals = useEditor((s) => s.numerals);
  const { edit, undo, redo, setNumerals } = store.getState();

  const saveFile = (format: SongFormat) => {
    const file = songFile(store.getState().song, format);
    download(file.name, file.text);
    toast('success', `Saved ${file.name}`);
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
        <ToolButton onClick={() => saveFile('text')}>Save as .txt</ToolButton>
        <ToolButton onClick={() => saveFile('chordpro')}>Save as ChordPro</ToolButton>
        <ToolButton onClick={() => navigate(`/pdf?song=${id}`)}>Export PDF</ToolButton>
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
  const pending = useRef<Song | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelled = useRef(false);

  useEffect(() => {
    const flush = () => {
      clearTimeout(timer.current);
      const song = pending.current;
      pending.current = null;
      if (!song) return;
      // A song that couldn't be saved mustn't go unnoticed: the toast stays until a save works again.
      saveSong(id, song).then(
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
