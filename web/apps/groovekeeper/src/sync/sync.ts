// Syncing the library in this browser with the account's songs and setlists. The library is always the one
// the app reads and writes; syncing pushes what changed here, then pulls what changed elsewhere.
import {
  db, type Conflict, type LibrarySetlist, type LibrarySong, type Refusal, type RemoteRow, type RemoteSetlist,
  type RemoteSong, type Synced, type SyncedTable, type SyncState,
} from '../library/db';

/** The fields of a row the app writes; the database sets owner, version and time itself. */
export type RemoteFields =
  | Pick<RemoteSong, 'title' | 'artist' | 'key' | 'text' | 'notes' | 'deleted'>
  | Pick<RemoteSetlist, 'name' | 'songs' | 'deleted'>;

/** The account's songs and setlists (sync/remote.ts talks to Supabase; tests use a stand-in). */
export interface Remote {
  /**
   * Adds new rows and returns them as stored. Throws a DuplicateError when one of the ids is taken, and a
   * RefusedError when the account refuses one (and so all of them).
   */
  insert(table: SyncedTable, rows: (RemoteFields & { id: string })[]): Promise<RemoteRow[]>;
  /**
   * Changes a row if the account still has that version of it; null when it has another (or none). Throws a
   * RefusedError when the account refuses the change.
   */
  update(table: SyncedTable, id: string, fields: RemoteFields, version: number): Promise<RemoteRow | null>;
  get(table: SyncedTable, id: string): Promise<RemoteRow | null>;
  /** Every row changed after `since` (a server time), or every row when it's null. */
  changedSince(table: SyncedTable, since: string | null): Promise<RemoteRow[]>;
  /** The marker that changes when the database is restored from a backup (supabase/migrations/20261009120000). */
  epoch(): Promise<string>;
}

export class DuplicateError extends Error {
  constructor() {
    super('A row with this id is already in the account');
  }
}

/** The account refused a row: it holds no more of them, or the row is too big (the database's limits). */
export class RefusedError extends Error {
  constructor(readonly reason: Refusal['reason']) {
    super(reason === 'limit' ? 'The account holds no more of these' : 'This is too big for the account');
  }
}

// New rows go up this many at a time, so one refused row holds back only its own batch.
const INSERT_BATCH = 50;

// Changes are asked for from a minute before the last one pulled: a change saved just before it may only
// show up in the database a moment later. Rows already here are recognized by their version.
const PULL_OVERLAP_MS = 60_000;

// Deletions sent to the account are remembered this long, for when it's restored from a backup.
const DELETION_LOG_MS = 90 * 24 * 60 * 60 * 1000;

type LocalRow = LibrarySong | LibrarySetlist;

const TABLES: SyncedTable[] = ['songs', 'setlists'];

const table = (name: SyncedTable) => (name === 'songs' ? db.songs : db.setlists) as typeof db.songs | typeof db.setlists;

function fields(name: SyncedTable, row: LocalRow): RemoteFields {
  if (name === 'songs') {
    const song = row as LibrarySong;
    return { title: song.title, artist: song.artist, key: song.key, text: song.text, notes: song.notes ?? [], deleted: false };
  }
  const setlist = row as LibrarySetlist;
  return { name: setlist.name, songs: setlist.songs, deleted: false };
}

/** What a deleted row holds: nothing but its id. */
const goneFields = (name: SyncedTable): RemoteFields =>
  name === 'songs'
    ? { title: '', artist: '', key: '', text: '', notes: [], deleted: true }
    : { name: '', songs: [], deleted: true };

/** The account's row as it's kept here: synced, so not changed here. */
function fromRemote(name: SyncedTable, row: RemoteRow): LocalRow {
  const synced = { id: row.id, version: row.version, dirty: 0 as const, updatedAt: Date.now() };
  if (name === 'songs') {
    const song = row as RemoteSong;
    return { ...synced, title: song.title, artist: song.artist, key: song.key, text: song.text, notes: song.notes ?? [] };
  }
  const setlist = row as RemoteSetlist;
  return { ...synced, name: setlist.name, songs: setlist.songs };
}

const sameContent = (name: SyncedTable, local: LocalRow, remote: RemoteRow): boolean =>
  JSON.stringify(fields(name, local)) === JSON.stringify(fields(name, fromRemote(name, remote)));

const putLocal = (name: SyncedTable, row: LocalRow) =>
  name === 'songs' ? db.songs.put(row as LibrarySong) : db.setlists.put(row as LibrarySetlist);

const getLocal = (name: SyncedTable, id: string): Promise<LocalRow | undefined> => table(name).get(id);

/**
 * Syncs the library with the account of `userId`: pushes deletions and changes made here, then pulls the
 * account's changes. A song open in the editor (`isOpen`) isn't replaced while it's open; its change waits.
 * Changes made in both places become conflicts (db.conflicts) for the user to settle.
 */
export async function sync(remote: Remote, userId: string, isOpen: (songId: string) => boolean): Promise<void> {
  let state: SyncState = (await db.meta.get('sync')) ?? { key: 'sync', userId, lastPulled: null, held: [] };
  if (state.userId !== userId) throw new Error('The library on this device belongs to another account');

  await db.deletionLog.where('at').below(Date.now() - DELETION_LOG_MS).delete();
  // A different marker than the one seen last: the account was restored from a backup, so it may have gone back
  // in time. This device sends everything again as new (rows the account has the same are adopted, ones that
  // differ become changes to settle) and takes in the account's rows afresh. A device's first sync only notes it.
  const epoch = await remote.epoch();
  if (state.epoch !== undefined && state.epoch !== epoch) {
    await afterRestore(remote);
    state = { ...state, lastPulled: null, held: [] };
  }
  // Saved now, so a sync cut short goes on from here instead of starting the restore over.
  state = { ...state, epoch };
  await db.meta.put(state);

  // The first sync on this device: songs made here as a guest that the account already has aren't added again.
  if (state.lastPulled === null) await dropCopiesOfAccountSongs(await remote.changedSince('songs', null));
  await pushDeletions(remote);
  for (const name of TABLES) await pushChanges(remote, name);

  const since = state.lastPulled === null ? null : new Date(Date.parse(state.lastPulled) - PULL_OVERLAP_MS).toISOString();
  const changed = await Promise.all(TABLES.map((name) => remote.changedSince(name, since)));
  let lastPulled = state.lastPulled;
  const held = new Set(state.held);
  for (const [i, name] of TABLES.entries()) {
    let deleted = false;
    for (const row of changed[i] ?? []) {
      if (lastPulled === null || Date.parse(row.updated_at) > Date.parse(lastPulled)) lastPulled = row.updated_at;
      if (name === 'songs' && isOpen(row.id)) held.add(row.id);
      else deleted = (await pull(name, row)) || deleted;
    }
    if (deleted) await mayHaveRoom(name);
  }
  // Songs that were open at an earlier sync and are closed now get their change.
  for (const id of [...held]) {
    if (isOpen(id)) continue;
    const row = await remote.get('songs', id);
    if (row) await pull('songs', row);
    held.delete(id);
  }
  await db.meta.put({ ...state, lastPulled, held: [...held] });
}

/**
 * Gets this device ready for an account restored from a backup. Deletions it sent, and ones waiting to be sent,
 * are done again where the backup brought the row back (a row this device never deleted stays). A row that is
 * newer here than the account's copy, or that the account lacks, goes up again as a change (a row the account
 * has newer comes down as usual). Changes found to settle are found again.
 */
async function afterRestore(remote: Remote): Promise<void> {
  const pending = await db.deletions.toArray();
  // A row the backup has at a version older than the deletion is one that came back; one at or past it was changed
  // after the deletion (on another device, which brought it back on purpose) and stays.
  const due = [
    ...(await db.deletionLog.toArray()).map(({ id, table, version }) => ({ id, table, version })),
    ...pending.map(({ id, table, version }) => ({ id, table, version: version + 1 })),
  ];
  for (const { id, table: name, version } of due) {
    const row = await remote.get(name, id);
    if (row && !row.deleted && row.version < version) await remote.update(name, id, goneFields(name), row.version);
  }
  const account = new Map<SyncedTable, Map<string, RemoteRow>>();
  for (const name of TABLES) account.set(name, new Map((await remote.changedSince(name, null)).map((row) => [row.id, row])));

  await db.transaction('rw', db.songs, db.setlists, db.deletions, db.deletionLog, db.conflicts, async () => {
    await db.deletionLog.bulkPut(pending.map(({ id, table: name, version }) => ({ id, table: name, at: Date.now(), version: version + 1 })));
    // Only the ones handled here: one made while the account was being read still waits to be sent.
    await db.deletions.bulkDelete(pending.map(({ id }) => id));
    await db.conflicts.clear();
    for (const name of TABLES) {
      const adjust = (row: LocalRow) => {
        const theirs = account.get(name)?.get(row.id);
        if (!theirs) {
          // The backup doesn't have it: it goes up as new.
          row.version = 0;
          row.dirty = 1;
        } else if (theirs.version < row.version) {
          // The backup has an older copy: this one goes up over it, if it isn't the same.
          row.version = theirs.version;
          if (!sameContent(name, row, theirs)) row.dirty = 1;
        }
      };
      if (name === 'songs') await db.songs.toCollection().modify(adjust);
      else await db.setlists.toCollection().modify(adjust);
    }
  });
}

/**
 * Removes the songs never synced from here that are exactly the same as a song in the account (title, artist,
 * key, text and notes), such as the sample songs added as a guest on two devices; setlists that used one get the
 * account's song instead. Each account song stands in for one copy, so two identical songs made here, with one
 * in the account, leave one to upload.
 */
async function dropCopiesOfAccountSongs(account: RemoteRow[]): Promise<void> {
  const same = (song: Pick<RemoteSong, 'title' | 'artist' | 'key' | 'text' | 'notes'>) =>
    JSON.stringify([song.title, song.artist, song.key, song.text, song.notes]);
  const waiting = new Map<string, string[]>();
  // The rows of the songs table.
  for (const row of account as RemoteSong[]) {
    if (row.deleted) continue;
    waiting.set(same(row), [...(waiting.get(same(row)) ?? []), row.id]);
  }
  await db.transaction('rw', db.songs, db.setlists, async () => {
    const replaced = new Map<string, string>();
    for (const song of await db.songs.filter((stored) => stored.version === 0).toArray()) {
      const ids = waiting.get(same({ ...song, notes: song.notes ?? [] }));
      const accountId = ids?.shift();
      if (accountId !== undefined && accountId !== song.id) replaced.set(song.id, accountId);
    }
    if (replaced.size === 0) return;
    await db.songs.bulkDelete([...replaced.keys()]);
    await db.setlists
      .filter((setlist) => setlist.songs.some((entry) => replaced.has(entry.songId)))
      .modify((setlist) => {
        setlist.songs = setlist.songs.map((entry) => ({ ...entry, songId: replaced.get(entry.songId) ?? entry.songId }));
        setlist.dirty = 1;
      });
  });
}

async function pushDeletions(remote: Remote): Promise<void> {
  for (const deletion of await db.deletions.toArray()) {
    const name = deletion.table;
    const done = await remote.update(name, deletion.id, goneFields(name), deletion.version);
    if (done) {
      await db.deletionLog.put({ id: deletion.id, table: name, at: Date.now(), version: done.version });
      await mayHaveRoom(name);
    } else {
      // Changed in the account since it was deleted here: the changed copy comes back rather than being lost.
      const row = await remote.get(name, deletion.id);
      if (row && !row.deleted && !(await getLocal(name, row.id))) await putLocal(name, fromRemote(name, row));
    }
    await db.deletions.delete(deletion.id);
  }
}

/** Rows refused by the account and not changed since: they wait until they change or there may be room. */
const waiting = (row: LocalRow): boolean => row.refused !== undefined && row.refused.at === row.updatedAt;

async function pushChanges(remote: Remote, name: SyncedTable): Promise<void> {
  const conflicted = new Set(await db.conflicts.toCollection().primaryKeys());
  const dirty = (await table(name).where('dirty').equals(1).toArray()).filter((row) => !conflicted.has(row.id) && !waiting(row));

  const added = dirty.filter((row) => row.version === 0);
  for (let start = 0; start < added.length; start += INSERT_BATCH) {
    const batch = added.slice(start, start + INSERT_BATCH);
    try {
      const stored = await remote.insert(name, batch.map((row) => ({ id: row.id, ...fields(name, row) })));
      const pushed = new Map(batch.map((row) => [row.id, row]));
      for (const row of stored) {
        const local = pushed.get(row.id);
        if (local) await adopt(name, row, local);
      }
    } catch (error) {
      if (!(error instanceof DuplicateError || error instanceof RefusedError)) throw error;
      // Some are in the account already (an earlier push whose answer was lost), or one was refused: one at a
      // time, so the others still go up.
      for (const row of batch) await pushOne(remote, name, row);
    }
  }
  for (const row of dirty.filter((r) => r.version > 0)) await pushOne(remote, name, row);
}

/** Pushes one changed row; a row the account changed since becomes a conflict, one it refused waits. */
async function pushOne(remote: Remote, name: SyncedTable, local: LocalRow): Promise<void> {
  try {
    await pushOneRow(remote, name, local);
  } catch (error) {
    if (!(error instanceof RefusedError)) throw error;
    await refuse(name, local, error.reason);
  }
}

async function pushOneRow(remote: Remote, name: SyncedTable, local: LocalRow): Promise<void> {
  let stored: RemoteRow | null = null;
  if (local.version === 0) {
    try {
      [stored = null] = await remote.insert(name, [{ id: local.id, ...fields(name, local) }]);
    } catch (error) {
      if (!(error instanceof DuplicateError)) throw error;
    }
  } else {
    stored = await remote.update(name, local.id, fields(name, local), local.version);
  }
  if (stored) return adopt(name, stored, local);

  const current = await remote.get(name, local.id);
  if (!current) {
    // Deleted in the account so long ago that it no longer remembers (90 days): changed here, it comes back.
    try {
      [stored = null] = await remote.insert(name, [{ id: local.id, ...fields(name, local) }]);
    } catch (error) {
      // The id is taken by a row this account can't see: it stays here, changed, and doesn't hold up the rest.
      if (!(error instanceof DuplicateError)) throw error;
    }
    if (stored) await adopt(name, stored, local);
    return;
  }
  if (current.deleted) {
    // Deleted elsewhere, changed here: the change brings it back.
    const restored = await remote.update(name, local.id, fields(name, local), current.version);
    if (restored) await adopt(name, restored, local);
  } else if (sameContent(name, local, current)) {
    await adopt(name, current, local);
  } else {
    await db.conflicts.put({ id: local.id, table: name, remote: current });
  }
}

/** Marks a row the account refused, unless it changed here meanwhile (then the change is tried next time). */
async function refuse(name: SyncedTable, pushed: LocalRow, reason: Refusal['reason']): Promise<void> {
  await db.transaction('rw', table(name), async () => {
    const current = await getLocal(name, pushed.id);
    if (current && current.updatedAt === pushed.updatedAt) await putLocal(name, { ...current, refused: { reason, at: current.updatedAt } });
  });
}

/** A deletion went through, here or elsewhere: rows refused because the account was full are tried again. */
async function mayHaveRoom(name: SyncedTable): Promise<void> {
  const full = (row: Synced) => row.refused?.reason === 'limit';
  const tryAgain = (row: Synced) => void delete row.refused;
  if (name === 'songs') await db.songs.filter(full).modify(tryAgain);
  else await db.setlists.filter(full).modify(tryAgain);
}

/**
 * Takes the account's version of a row just pushed. If it was changed here again while being pushed, it
 * stays changed, now based on that version.
 */
async function adopt(name: SyncedTable, stored: RemoteRow, pushed: LocalRow): Promise<void> {
  await db.transaction('rw', table(name), db.deletions, async () => {
    const current = await getLocal(name, stored.id);
    if (current) {
      const { refused: _, ...accepted } = current;
      await putLocal(name, { ...accepted, version: stored.version, dirty: current.updatedAt === pushed.updatedAt ? 0 : 1 });
    } else {
      // Deleted here while it was pushed: delete the version just stored.
      const deletion = await db.deletions.get(stored.id);
      if (deletion) await db.deletions.put({ ...deletion, version: stored.version });
    }
  });
}

/**
 * Takes one of the account's changes into the library, unless the copy here is as new or newer. True when
 * it deleted a row here (a deletion made elsewhere).
 */
async function pull(name: SyncedTable, row: RemoteRow): Promise<boolean> {
  const conflict = await db.conflicts.get(row.id);
  if (conflict) {
    // Still unsettled: the user chooses against the newest copy in the account.
    if (row.version > conflict.remote.version) await db.conflicts.put({ ...conflict, remote: row });
    return false;
  }
  const local = await getLocal(name, row.id);
  if (!local) {
    if (!row.deleted && !(await db.deletions.get(row.id))) await putLocal(name, fromRemote(name, row));
    return false;
  }
  if (row.version <= local.version) return false;
  if (!local.dirty) {
    if (row.deleted) {
      await table(name).delete(row.id);
      return true;
    }
    await putLocal(name, fromRemote(name, row));
  } else if (row.deleted) {
    // Deleted elsewhere, changed here: the change is kept, and the next push brings it back.
    await putLocal(name, { ...local, version: row.version });
  } else if (sameContent(name, local, row)) {
    await putLocal(name, { ...local, version: row.version, dirty: 0 });
  } else {
    await db.conflicts.put({ id: row.id, table: name, remote: row });
  }
  return false;
}

/** Settles a conflict with the copy on this device: it's saved over the account's at the next sync. */
export async function keepThisDevice(conflict: Conflict): Promise<void> {
  await db.transaction('rw', table(conflict.table), db.conflicts, async () => {
    const local = await getLocal(conflict.table, conflict.id);
    if (local) await putLocal(conflict.table, { ...local, version: conflict.remote.version, dirty: 1 });
    await db.conflicts.delete(conflict.id);
  });
}

/** Settles a conflict with the account's copy, replacing the one on this device. */
export async function keepAccount(conflict: Conflict): Promise<void> {
  await db.transaction('rw', table(conflict.table), db.conflicts, async () => {
    if (conflict.remote.deleted) await table(conflict.table).delete(conflict.id);
    else await putLocal(conflict.table, fromRemote(conflict.table, conflict.remote));
    await db.conflicts.delete(conflict.id);
  });
}
