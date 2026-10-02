import Dexie, { type EntityTable } from 'dexie';

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

export const db = new Dexie('groovekeeper') as Dexie & { songs: EntityTable<LibrarySong, 'id'> };

db.version(1).stores({ songs: 'id, title' });
