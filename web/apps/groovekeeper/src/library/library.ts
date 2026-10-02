import { parseSongText, songToText, type Song } from '@groovekeeper/core';
import { db, type LibrarySong } from './db';
import { newId } from './ids';

const byTitle = (a: LibrarySong, b: LibrarySong): number =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) ||
  a.artist.localeCompare(b.artist, undefined, { sensitivity: 'base' });

/** Every song in the library, by title. */
export async function listSongs(): Promise<LibrarySong[]> {
  return (await db.songs.toArray()).toSorted(byTitle);
}

/** Whether the song's title, artist or key contains the search text, ignoring case. */
export function matchesSearch(song: LibrarySong, search: string): boolean {
  const needle = search.trim().toLowerCase();
  return [song.title, song.artist, song.key].some((field) => field.toLowerCase().includes(needle));
}

const record = (id: string, song: Song): LibrarySong => ({
  id,
  title: song.title,
  artist: song.artist,
  key: song.key,
  text: songToText(song),
  updatedAt: Date.now(),
});


let persistRequested = false;

/**
 * Asks the browser not to clear the library when space runs low or the site isn't used for a while. Asked
 * once, when the first song is stored; the browser may still refuse, so exporting stays the real backup.
 */
function keepLibrary(): void {
  if (persistRequested) return;
  persistRequested = true;
  void navigator.storage?.persist?.().catch(() => false);
}

/** Adds the songs to the library and returns their ids, in the same order. */
export async function addSongs(songs: Song[]): Promise<string[]> {
  const records = songs.map((song) => record(newId(), song));
  await db.songs.bulkAdd(records);
  keepLibrary();
  return records.map((r) => r.id);
}

/** The library song with this id, read into a song; undefined if there is none. */
export async function getSong(id: string): Promise<Song | undefined> {
  const stored = await db.songs.get(id);
  return stored && parseSongText(stored.text);
}

export async function saveSong(id: string, song: Song): Promise<void> {
  await db.songs.put(record(id, song));
  keepLibrary();
}

/** Removes the song from the library, and from every setlist it's in. */
export async function deleteSong(id: string): Promise<void> {
  await db.transaction('rw', db.songs, db.setlists, async () => {
    await db.songs.delete(id);
    await db.setlists
      .filter((setlist) => setlist.songs.some((entry) => entry.songId === id))
      .modify((setlist) => {
        setlist.songs = setlist.songs.filter((entry) => entry.songId !== id);
      });
  });
}
