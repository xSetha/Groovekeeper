import Dexie, { type EntityTable } from 'dexie';
import { newId } from './ids';

/**
 * A song in the browser's library. Like the desktop library, the song itself is stored as its .txt
 * text; title, artist and key are kept beside it for the list and the search.
 */
export interface LibrarySong extends Synced {
  id: string;
  title: string;
  artist: string;
  key: string;
  text: string;
  /** Notes floating over the song; they aren't part of its text. Songs saved before notes have none. */
  notes?: SongNote[];
  updatedAt: number;
}

/**
 * A note floating over the song in the editor, at a spot of its own rather than on a line, so it stays put
 * while the lyrics under it change. Notes aren't in the song's text (.txt or ChordPro files); the library
 * keeps them beside it, and the PDF prints them where they float.
 */
export interface SongNote {
  id: string;
  /** The note's text; it may have several lines. */
  text: string;
  /** Where it starts across the song, in lyric letters from the start of the lines. */
  column: number;
  /** Where its top is in the editor, in pixels from the top of the song's sections. */
  top: number;
  /**
   * What its top was over the last time the editor laid the song out, for the PDF and the phone: the index
   * of a line among the song's lines plus how far down towards the next (3.5 is halfway between lines 3 and 4).
   */
  printRow: number;
}

/**
 * How a song or setlist stands with the account it syncs to. `version` is the account's version this copy
 * was made from (0: not in the account yet); `dirty` is 1 when it was changed here since (a number, so
 * it can be indexed).
 */
export interface Synced {
  version: number;
  dirty: 0 | 1;
}

/**
 * A song in a setlist, played as it's written. It has its own id because the same song can be in a setlist
 * twice, and its place changes when the setlist is reordered. (Entries saved when setlists had a key for each
 * song still carry a `key`; it's ignored.)
 */
export interface SetlistEntry {
  id: string;
  songId: string;
}

/** A setlist: songs in playing order. It only refers to its songs, so editing a song shows in every setlist. */
export interface LibrarySetlist extends Synced {
  id: string;
  name: string;
  songs: SetlistEntry[];
  updatedAt: number;
}

/** A song or setlist deleted here that the account still has; the next sync deletes it there too. */
export interface Deletion {
  id: string;
  table: SyncedTable;
  version: number;
}

export type SyncedTable = 'songs' | 'setlists';

/**
 * A song or setlist changed both here and in the account since the last sync; the user picks the copy to
 * keep. `remote` is the account's copy, as the database has it.
 */
export interface Conflict {
  id: string;
  table: SyncedTable;
  remote: RemoteRow;
}

/** A row of the account's songs or setlists table (see supabase/migrations). */
export type RemoteRow = RemoteSong | RemoteSetlist;

export interface RemoteSong {
  id: string;
  title: string;
  artist: string;
  key: string;
  text: string;
  notes: SongNote[];
  deleted: boolean;
  version: number;
  updated_at: string;
}

export interface RemoteSetlist {
  id: string;
  name: string;
  songs: SetlistEntry[];
  deleted: boolean;
  version: number;
  updated_at: string;
}

/**
 * Where syncing stands: the account the library syncs with, the server time of the last change it pulled,
 * and songs whose change from the account waits until the song is closed in the editor.
 */
export interface SyncState {
  key: 'sync';
  userId: string;
  lastPulled: string | null;
  held: string[];
}

export const db = new Dexie('groovekeeper') as Dexie & {
  songs: EntityTable<LibrarySong, 'id'>;
  setlists: EntityTable<LibrarySetlist, 'id'>;
  deletions: EntityTable<Deletion, 'id'>;
  conflicts: EntityTable<Conflict, 'id'>;
  meta: EntityTable<SyncState, 'key'>;
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
// Version 4 syncs with an account: everything already here is new to the account, so it's marked changed.
db.version(4)
  .stores({ songs: 'id, title, dirty', setlists: 'id, name, dirty', deletions: 'id', conflicts: 'id', meta: 'key' })
  .upgrade(async (tx) => {
    const unsynced = (row: Synced) => {
      row.version = 0;
      row.dirty = 1;
    };
    await tx.table<LibrarySong>('songs').toCollection().modify(unsynced);
    await tx.table<LibrarySetlist>('setlists').toCollection().modify(unsynced);
  });
