import { UNTITLED_TITLE } from '@groovekeeper/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { trackDrag } from '../components/drag';
import { db, type LibrarySetlist } from '../library/db';
import { listSongs, matchesSearch } from '../library/library';
import {
  addEntry, deleteSetlist, keyNote, moveEntry, removeEntry, setEntryKey, setlistSongs, updateSetlist, type SetlistSong,
} from '../library/setlists';
import { isNewFrom } from '../navigation';
import { useIsPhone } from '../phone';

// The name is saved this long after the last key, so typing doesn't write on every key.
const SAVE_DELAY_MS = 400;

/** A setlist: edited on a computer or tablet, opened to play on a phone. */
export function SetlistPage() {
  const { id = '' } = useParams();
  const phone = useIsPhone();
  // null while loading, undefined when there's no such setlist
  const loaded = useLiveQuery(
    async () => {
      const setlist = await db.setlists.get(id);
      return setlist ? { setlist, songs: await setlistSongs(setlist) } : undefined;
    },
    [id],
    null,
  );

  useEffect(() => {
    if (loaded) document.title = `${loaded.setlist.name} – Groovekeeper`;
  }, [loaded]);

  if (loaded === null) return null;
  if (loaded === undefined) {
    return (
      <main className="p-10">
        <p>This setlist isn't in your library.</p>
        <Link to="/setlists" className="mt-2 inline-block text-accent hover:underline">
          Back to the setlists
        </Link>
      </main>
    );
  }
  return phone ? <SetlistToPlay {...loaded} /> : <SetlistEditor key={id} {...loaded} />;
}

interface Loaded {
  setlist: LibrarySetlist;
  songs: SetlistSong[];
}

/** On a phone: the songs in order; each opens in the reading view, in its setlist key. */
function SetlistToPlay({ setlist, songs }: Loaded) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Link to="/setlists" className="-ml-2 inline-flex min-h-11 items-center px-2 text-muted">
        ‹ Setlists
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">{setlist.name}</h1>
      {songs.length === 0 ? <p className="mt-4 text-muted">No songs in this setlist yet.</p> : null}
      <ol className="mt-4">
        {songs.map((song, position) => (
          <li key={song.entry.id}>
            <Link to={`/setlists/${setlist.id}/${position + 1}`} className="flex min-h-14 items-center gap-3 rounded px-2 py-2 hover:bg-hover">
              <span className="w-6 shrink-0 text-right font-mono text-muted">{position + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{song.title}</span>
                {song.artist ? <span className="block truncate text-sm text-muted">{song.artist}</span> : null}
              </span>
              {song.key ? <span className="shrink-0 rounded bg-chip px-1.5 py-0.5 font-mono text-sm">{song.key}</span> : null}
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}

/** On a computer or tablet: rename the setlist, order its songs, pick their keys, and add songs from the library. */
function SetlistEditor({ setlist, songs }: Loaded) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState(false);
  const [drop, setDrop] = useState<number | null>(null);
  const rows = useRef<HTMLOListElement>(null);

  const change = (update: (setlist: LibrarySetlist) => LibrarySetlist) => {
    setError(false);
    updateSetlist(setlist.id, update).catch(() => setError(true));
  };

  /** Moves a song past its neighbour on the list as shown, so the arrows always move it one visible place. */
  const moveNextTo = (song: SetlistSong, neighbour: number, side: 'before' | 'after') => {
    const target = songs[neighbour];
    if (target) change((s) => moveEntry(s, song.entry.id, target.entry.id, side));
  };

  /** Dragging a row by its handle: a line shows where it will go. */
  function startDrag(event: PointerEvent<HTMLButtonElement>, from: number) {
    if (event.pointerType === 'mouse') event.preventDefault();
    // The rows' places are read once, before anything moves.
    const middles = [...(rows.current?.children ?? [])].map((row) => {
      const box = row.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    const placeAt = (y: number) => middles.filter((middle) => middle < y).length;
    trackDrag(event, {
      onMove: (move) => setDrop(placeAt(move.clientY)),
      onEnd: (end) => {
        setDrop(null);
        if (!end) return;
        const place = placeAt(end.clientY);
        const moving = songs[from]?.entry.id;
        // Dropped just above or below itself: it stays where it is.
        if (!moving || place === from || place === from + 1) return;
        const before = songs[place];
        const last = songs.at(-1);
        if (before) change((s) => moveEntry(s, moving, before.entry.id, 'before'));
        else if (last) change((s) => moveEntry(s, moving, last.entry.id, 'after'));
      },
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <Link to="/setlists" className="text-sm text-muted hover:text-fg">
          ← Setlists
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <NameField setlist={setlist} onError={() => setError(true)} />
          <Link
            to={`/pdf?setlist=${setlist.id}`}
            className="ml-auto rounded px-2 py-1.5 text-sm hover:bg-hover pointer-coarse:min-h-11"
          >
            Export PDF
          </Link>
          <button
            type="button"
            className="rounded px-2 py-1.5 text-sm hover:bg-hover pointer-coarse:min-h-11"
            onClick={() => setConfirmDelete(true)}
          >
            Delete setlist
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">
          {songs.length === 1 ? '1 song' : `${songs.length} songs`}. Changes are saved right away; a song's key here
          never changes the song.
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-chord">
            Couldn't save the setlist. Reload the page and try again.
          </p>
        ) : null}

        {songs.length === 0 ? <p className="mt-6 text-muted">No songs yet. Add songs from the library.</p> : null}
        <ol ref={rows} className="mt-4" aria-label="Songs in playing order">
          {songs.map((song, position) => (
            <li
              key={song.entry.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 py-2 ${drop === position ? 'border-accent' : 'border-transparent'}`}
            >
              <button
                type="button"
                aria-label={`Drag ${song.title} to another place`}
                title="Drag to reorder"
                className="cursor-grab rounded px-1 text-muted select-none hover:bg-hover hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                onPointerDown={(event) => startDrag(event, position)}
              >
                ⠿
              </button>
              <span className="w-6 text-right font-mono text-muted">{position + 1}</span>
              <span className="min-w-40 flex-1">
                <Link to={`/songs/${song.entry.songId}`} className="font-semibold hover:underline">
                  {song.title}
                </Link>
                {song.artist ? <span className="block text-sm text-muted">{song.artist}</span> : null}
              </span>
              <label className="flex items-center gap-1.5 text-sm">
                <span className="text-muted">Key</span>
                <select
                  value={song.key}
                  disabled={song.keyOptions.length === 0}
                  className="rounded border border-line bg-window px-1 py-1 font-semibold pointer-coarse:min-h-11"
                  onChange={(event) => {
                    const key = event.target.value;
                    change((s) => setEntryKey(s, song.entry.id, key));
                  }}
                >
                  {song.keyOptions.length === 0 ? <option value="">–</option> : null}
                  {song.keyOptions.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
              <span className="w-40 text-sm text-muted">{keyNote(song)}</span>
              <span className="flex items-center text-sm">
                <RowButton label={`Move ${song.title} up`} disabled={position === 0} onClick={() => moveNextTo(song, position - 1, 'before')}>↑</RowButton>
                <RowButton label={`Move ${song.title} down`} disabled={position === songs.length - 1} onClick={() => moveNextTo(song, position + 1, 'after')}>↓</RowButton>
                <RowButton label={`Remove ${song.title} from the setlist`} onClick={() => change((s) => removeEntry(s, song.entry.id))}>Remove</RowButton>
              </span>
            </li>
          ))}
          {drop === songs.length ? <li aria-hidden="true" className="border-t-2 border-accent" /> : null}
        </ol>
      </main>
      <AddSongs onAdd={(songId) => change((s) => addEntry(s, songId))} />

      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete “${setlist.name}”?`}
          message="The setlist is deleted. Its songs stay in the library."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            deleteSetlist(setlist.id)
              .then(() => navigate('/setlists'))
              .catch(() => {
                setConfirmDelete(false);
                setError(true);
              });
          }}
        />
      ) : null}
    </div>
  );
}

/** The setlist's name, saved shortly after typing stops. A blank name isn't saved. */
function NameField({ setlist, onError }: { setlist: LibrarySetlist; onError: () => void }) {
  // Typed into local state: the stored name comes back from the database a moment later, which would move the caret.
  const [name, setName] = useState(setlist.name);
  const isNew = isNewFrom(useLocation().state);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The name typed but not saved yet, so leaving the page (which doesn't always blur the box) still saves it.
  const pending = useRef<string | null>(null);

  useEffect(() => {
    // A new setlist: ready to type its name.
    if (!isNew) return;
    input.current?.focus();
    input.current?.select();
  }, [isNew]);

  const save = (value: string) => {
    clearTimeout(timer.current);
    pending.current = null;
    saveName(setlist.id, value, onError);
  };

  // Leaving the page saves what's typed; the setlist's id is all this needs, and it never changes here.
  const id = setlist.id;
  useEffect(() => {
    const flush = () => {
      clearTimeout(timer.current);
      if (pending.current !== null) saveName(id, pending.current, onError);
      pending.current = null;
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
    // onError only sets an error flag; the first one does that as well as any later one.
  }, [id]);

  return (
    <input
      ref={input}
      value={name}
      aria-label="Setlist name"
      placeholder="Name the setlist"
      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-3xl font-semibold outline-none placeholder:text-hint"
      onChange={(event) => {
        const value = event.target.value;
        setName(value);
        pending.current = value;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => save(value), SAVE_DELAY_MS);
      }}
      onBlur={() => pending.current !== null && save(pending.current)}
    />
  );
}

/** Saves a setlist's name; a blank name is left unsaved. */
function saveName(id: string, value: string, onError: () => void): void {
  const name = value.trim();
  if (name.length === 0) return;
  updateSetlist(id, (s) => (s.name === name ? s : { ...s, name })).catch(onError);
}

/** The library beside the setlist, each song with a button to add it at the end. */
function AddSongs({ onAdd }: { onAdd: (songId: string) => void }) {
  const library = useLiveQuery(listSongs, []);
  const [search, setSearch] = useState('');
  const shown = library?.filter((song) => matchesSearch(song, search));

  return (
    <aside aria-label="Add songs" className="flex min-h-0 shrink-0 flex-col border-line p-4 max-lg:max-h-80 max-lg:border-t lg:w-80 lg:border-l">
      <h2 className="font-semibold">Add songs</h2>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search title, artist or key"
        aria-label="Search the library"
        className="mt-3 rounded border border-line bg-window px-2 py-1.5 text-base placeholder:text-hint focus:border-accent focus:outline-none pointer-fine:text-sm pointer-coarse:min-h-11"
      />
      <ul className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {shown?.map((song) => (
          <li key={song.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-hover">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{song.title || UNTITLED_TITLE}</span>
              {song.artist ? <span className="block truncate text-xs text-muted">{song.artist}</span> : null}
            </span>
            <button
              type="button"
              aria-label={`Add ${song.title || UNTITLED_TITLE}`}
              className="rounded px-2 py-1 text-sm text-accent hover:bg-card pointer-coarse:min-h-11"
              onClick={() => onAdd(song.id)}
            >
              + Add
            </button>
          </li>
        ))}
      </ul>
      {library?.length === 0 ? <p className="text-sm text-muted">The library is empty. Write or import songs first.</p> : null}
    </aside>
  );
}

function RowButton(props: { label: string; disabled?: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="rounded px-1.5 py-0.5 text-muted hover:bg-hover hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent pointer-coarse:min-h-11 pointer-coarse:min-w-11"
    >
      {props.children}
    </button>
  );
}
