import Dexie, { type EntityTable } from 'dexie';
import { newId } from './ids';

/**
 * A song in the browser's library. Like the desktop library, the song itself is stored as its .txt
 * text; title, artist and key are kept beside it for the list and the search.
 */
export interface LibrarySong {
  id: string;
  title: string;
  artist: string;
  key: string;
  text: string;
  updatedAt: number;
}

/**
 * A song in a setlist: the library song, and the key to play it in ('' plays it as written). It has its own
 * id because the same song can be in a setlist twice, and its place changes when the setlist is reordered.
 */
export interface SetlistEntry {
  id: string;
  songId: string;
  key: string;
}

/** A setlist: songs in playing order. It only refers to its songs, so editing a song shows in every setlist. */
export interface LibrarySetlist {
  id: string;
  name: string;
  songs: SetlistEntry[];
  updatedAt: number;
}

export const db = new Dexie('groovekeeper') as Dexie & {
  songs: EntityTable<LibrarySong, 'id'>;
  setlists: EntityTable<LibrarySetlist, 'id'>;
};

db.version(1).stores({ songs: 'id, title' });
// Version 2 adds the setlists; a library from version 1 keeps its songs.
db.version(2).stores({ songs: 'id, title', setlists: 'id, name' });
// Version 3 gives every song in a setlist its own id.
db.version(3)
  .stores({ songs: 'id, title', setlists: 'id, name' })
  .upgrade((tx) =>
    tx.table<LibrarySetlist>('setlists').toCollection().modify((setlist) => {
      // Entries from version 2 have no id yet.
      setlist.songs = setlist.songs.map((entry) => ({ ...entry, id: entry.id ?? newId() }));
    }),
  );
