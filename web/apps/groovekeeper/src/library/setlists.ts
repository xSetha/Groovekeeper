// Setlists in the library. Every change is saved right away, as in the desktop app.
import { parseSongText, UNTITLED_TITLE, type Song } from '@groovekeeper/core';
import { changedAt, db, type LibrarySetlist, type LibrarySong, type SetlistEntry, type SongNote } from './db';
import { newId } from './ids';

/** What a new setlist is called until it's renamed. */
export const NEW_SETLIST_NAME = 'New setlist';

/** Every setlist, by name. */
export async function listSetlists(): Promise<LibrarySetlist[]> {
  return (await db.setlists.toArray()).toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function createSetlist(): Promise<string> {
  const id = newId();
  await db.setlists.add({ id, name: NEW_SETLIST_NAME, songs: [], updatedAt: Date.now(), version: 0, dirty: 1 });
  return id;
}

/** Changes a setlist and saves it; nothing happens if it's gone. */
export async function updateSetlist(id: string, change: (setlist: LibrarySetlist) => LibrarySetlist): Promise<void> {
  await db.transaction('rw', db.setlists, async () => {
    const setlist = await db.setlists.get(id);
    if (setlist) await db.setlists.put({ ...change(setlist), updatedAt: changedAt(setlist.updatedAt), dirty: 1 });
  });
}

/** Deletes the setlist, here and at the next sync in the account; its songs stay in the library. */
export async function deleteSetlist(id: string): Promise<void> {
  await db.transaction('rw', db.setlists, db.deletions, async () => {
    const stored = await db.setlists.get(id);
    if (stored && stored.version > 0) await db.deletions.put({ id, table: 'setlists', version: stored.version });
    await db.setlists.delete(id);
  });
}

// ---- Changes to a setlist's songs, each found by its own id ----

/** The song added at the end. */
export const addEntry = (setlist: LibrarySetlist, songId: string): LibrarySetlist => ({
  ...setlist,
  songs: [...setlist.songs, { id: newId(), songId }],
});

/**
 * The song moved to just before (or after) another one. Moves are made against the songs that are shown,
 * so a song missing from the library can't swallow a move. Unchanged when either song isn't found.
 */
export function moveEntry(setlist: LibrarySetlist, entryId: string, targetId: string, side: 'before' | 'after'): LibrarySetlist {
  const entry = setlist.songs.find((e) => e.id === entryId);
  if (!entry || entryId === targetId) return setlist;
  const rest = setlist.songs.filter((e) => e.id !== entryId);
  const target = rest.findIndex((e) => e.id === targetId);
  if (target < 0) return setlist;
  return { ...setlist, songs: rest.toSpliced(side === 'before' ? target : target + 1, 0, entry) };
}

export const removeEntry = (setlist: LibrarySetlist, entryId: string): LibrarySetlist => ({
  ...setlist,
  songs: setlist.songs.filter((e) => e.id !== entryId),
});

// ---- Reading a setlist's songs ----

/** A song of a setlist as it's shown and played: as it's written. */
export interface SetlistSong {
  entry: SetlistEntry;
  song: Song;
  notes: SongNote[];
  title: string;
  artist: string;
}

export const setlistSong = (entry: SetlistEntry, stored: LibrarySong): SetlistSong => ({
  entry,
  song: parseSongText(stored.text),
  notes: stored.notes ?? [],
  title: stored.title || UNTITLED_TITLE,
  artist: stored.artist,
});

/** The setlist's songs, in order. Songs that are no longer in the library are left out. */
export async function setlistSongs(setlist: LibrarySetlist): Promise<SetlistSong[]> {
  const stored = await db.songs.bulkGet(setlist.songs.map((entry) => entry.songId));
  return setlist.songs.flatMap((entry, i) => {
    const song = stored[i];
    return song ? [setlistSong(entry, song)] : [];
  });
}
