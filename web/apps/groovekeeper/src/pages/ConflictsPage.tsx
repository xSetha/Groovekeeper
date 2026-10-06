import { UNTITLED_TITLE } from '@groovekeeper/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { db, type Conflict, type LibrarySetlist, type LibrarySong, type RemoteSetlist, type RemoteSong } from '../library/db';
import { runSync } from '../sync/account';
import { keepAccount, keepThisDevice } from '../sync/sync';
import { toast } from '../toasts';

/** Songs and setlists changed both here and on another device: both copies side by side, and which to keep. */
export default function ConflictsPage() {
  const conflicts = useLiveQuery(() => db.conflicts.toArray(), []);

  useEffect(() => {
    document.title = 'Changed on two devices – Groovekeeper';
  }, []);

  if (!conflicts) return null;
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Changed on two devices</h1>
        {conflicts.length === 0 ? (
          <>
            <p className="mt-3 text-muted">Nothing to settle: this device and your account have the same songs.</p>
            <Link to="/" className="mt-2 inline-block text-accent hover:underline">
              Back to the library
            </Link>
          </>
        ) : (
          <p className="mt-2 text-muted">
            These were changed on this device and on another one since they last synced. Pick the copy to keep; the
            other is replaced.
          </p>
        )}
        {conflicts.map((conflict) => (
          <ConflictRow key={conflict.id} conflict={conflict} />
        ))}
      </div>
    </main>
  );
}

function ConflictRow({ conflict }: { conflict: Conflict }) {
  const local = useLiveQuery(
    async (): Promise<LibrarySong | LibrarySetlist | undefined> =>
      conflict.table === 'songs' ? db.songs.get(conflict.id) : db.setlists.get(conflict.id),
    [conflict.id, conflict.table],
  );
  const keep = (choice: typeof keepThisDevice) => {
    choice(conflict)
      .then(() => runSync())
      .catch(() => toast('error', 'Couldn’t keep that copy', 'Reload the page and try again.'));
  };

  const what = conflict.table === 'songs' ? 'Song' : 'Setlist';
  return (
    <section className="mt-8 border-t border-line pt-6" aria-label={`${what} changed on two devices`}>
      <div className="grid gap-6 md:grid-cols-2">
        <Copy heading="On this device" onKeep={() => keep(keepThisDevice)}>
          {local ? <Content table={conflict.table} row={local} /> : <p className="text-muted">Deleted on this device.</p>}
        </Copy>
        <Copy heading="In your account" onKeep={() => keep(keepAccount)}>
          {conflict.remote.deleted ? (
            <p className="text-muted">Deleted on another device.</p>
          ) : (
            <Content table={conflict.table} row={conflict.remote} />
          )}
        </Copy>
      </div>
    </section>
  );
}

function Copy({ heading, onKeep, children }: { heading: string; onKeep: () => void; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-line bg-card p-4">
      <h2 className="text-sm font-semibold text-muted">{heading}</h2>
      <div className="mt-2 min-h-0 flex-1">{children}</div>
      <button
        type="button"
        className="mt-4 self-start rounded bg-accent-fill px-4 py-2 font-semibold text-on-accent hover:brightness-125 pointer-coarse:min-h-11"
        onClick={onKeep}
      >
        Keep this copy
      </button>
    </div>
  );
}

/** A song's text as written, or a setlist's name and songs. */
function Content({ table, row }: { table: Conflict['table']; row: LibrarySong | RemoteSong | LibrarySetlist | RemoteSetlist }) {
  if (table === 'songs') {
    const song = row as LibrarySong | RemoteSong;
    return (
      <>
        <p className="font-semibold">{song.title || UNTITLED_TITLE}</p>
        <pre className="mt-2 max-h-96 overflow-auto font-mono text-sm whitespace-pre">{song.text}</pre>
      </>
    );
  }
  const setlist = row as LibrarySetlist | RemoteSetlist;
  return <SetlistContent name={setlist.name} songIds={setlist.songs.map((entry) => entry.songId)} />;
}

function SetlistContent({ name, songIds }: { name: string; songIds: string[] }) {
  const songs = useLiveQuery(() => db.songs.bulkGet(songIds), [songIds.join()]);
  return (
    <>
      <p className="font-semibold">{name}</p>
      <ol className="mt-2 list-decimal pl-6 text-sm">
        {songIds.map((id, i) => (
          <li key={`${id}-${i}`}>
            {songs?.[i]?.title || UNTITLED_TITLE}
          </li>
        ))}
      </ol>
    </>
  );
}
