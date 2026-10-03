// Setlists in the library. Every change is saved right away, as in the desktop app.
import {
  keysOfMode, parseSongText, sameKey, semitonesBetween, songKey, transposeSong, UNTITLED_TITLE, type Song,
} from '@groovekeeper/core';
import { db, type LibrarySetlist, type LibrarySong, type SetlistEntry } from './db';
import { newId } from './ids';

/** What a new setlist is called until it's renamed. */
export const NEW_SETLIST_NAME = 'New setlist';

/** Every setlist, by name. */
export async function listSetlists(): Promise<LibrarySetlist[]> {
  return (await db.setlists.toArray()).toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export async function createSetlist(): Promise<string> {
  const id = newId();
  await db.setlists.add({ id, name: NEW_SETLIST_NAME, songs: [], updatedAt: Date.now() });
  return id;
}

/** Changes a setlist and saves it; nothing happens if it's gone. */
export async function updateSetlist(id: string, change: (setlist: LibrarySetlist) => LibrarySetlist): Promise<void> {
  await db.transaction('rw', db.setlists, async () => {
    const setlist = await db.setlists.get(id);
    if (setlist) await db.setlists.put({ ...change(setlist), updatedAt: Date.now() });
  });
}

/** Deletes the setlist; its songs stay in the library. */
export async function deleteSetlist(id: string): Promise<void> {
  await db.setlists.delete(id);
}

// ---- Changes to a setlist's songs, each found by its own id ----

/** The song added at the end, to be played in its own key. */
export const addEntry = (setlist: LibrarySetlist, songId: string): LibrarySetlist => ({
  ...setlist,
  songs: [...setlist.songs, { id: newId(), songId, key: '' }],
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

export const setEntryKey = (setlist: LibrarySetlist, entryId: string, key: string): LibrarySetlist => ({
  ...setlist,
  songs: setlist.songs.map((e) => (e.id === entryId ? { ...e, key } : e)),
});

// ---- Reading a setlist's songs ----

/** A song of a setlist as it's shown and played: the song, and the key it's played in. */
export interface SetlistSong {
  entry: SetlistEntry;
  song: Song;
  title: string;
  artist: string;
  /** The key the song is written in, or detected from its chords; '' if neither. */
  originalKey: string;
  detected: boolean;
  /** The keys it can be played in: the twelve of its mode. Empty without a key. */
  keyOptions: string[];
  /** The key it's played in. */
  key: string;
  /** How far the played key is from the original, -5 … +6. */
  semitones: number;
}

export function setlistSong(entry: SetlistEntry, stored: LibrarySong): SetlistSong {
  const song = parseSongText(stored.text);
  const { key: originalKey, detected } = songKey(song);
  const keyOptions = keysOfMode(originalKey);
  // The key chosen for the setlist, spelled as in the options; the original key when none was chosen.
  const key = keyOptions.find((option) => sameKey(option, entry.key)) ?? keyOptions.find((option) => sameKey(option, originalKey)) ?? '';
  return {
    entry,
    song,
    title: stored.title || UNTITLED_TITLE,
    artist: stored.artist,
    originalKey,
    detected,
    keyOptions,
    key,
    semitones: semitonesBetween(originalKey, key),
  };
}

/** The song as it's played: in its setlist key, and marked with the key its chords point to when it has none written. */
export function songToPlay({ song, originalKey, detected, semitones }: SetlistSong): Song {
  if (semitones === 0 && !detected) return song;
  return transposeSong({ ...song, key: originalKey }, semitones);
}

/** The setlist's songs, in order. Songs that are no longer in the library are left out. */
export async function setlistSongs(setlist: LibrarySetlist): Promise<SetlistSong[]> {
  const stored = await db.songs.bulkGet(setlist.songs.map((entry) => entry.songId));
  return setlist.songs.flatMap((entry, i) => {
    const song = stored[i];
    return song ? [setlistSong(entry, song)] : [];
  });
}

/** "original key", "+2 from G", "−3 from Am (detected)", or that there's no key. */
export function keyNote(song: SetlistSong): string {
  if (!song.originalKey) return 'no key, plays as written';
  const note = song.semitones === 0 ? 'original key' : `${song.semitones > 0 ? '+' : '−'}${Math.abs(song.semitones)} from ${song.originalKey}`;
  return song.detected ? `${note} (detected)` : note;
}
