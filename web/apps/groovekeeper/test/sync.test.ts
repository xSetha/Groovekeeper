import { createTemplate, parseSongText } from '@groovekeeper/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type RemoteRow, type RemoteSong, type SyncedTable } from '../src/library/db';
import { addSongs, deleteSong, saveSong } from '../src/library/library';
import { addEntry, createSetlist, updateSetlist } from '../src/library/setlists';
import { DuplicateError, keepAccount, keepThisDevice, sync, type Remote, type RemoteFields } from '../src/sync/sync';

/** The account, kept in memory with the database's rules: versions count up, the server sets the time. */
class FakeAccount implements Remote {
  rows: Record<SyncedTable, Map<string, RemoteRow>> = { songs: new Map(), setlists: new Map() };
  private clock = Date.parse('2026-10-03T12:00:00Z');
  /** Runs once during the next insert, as if the user typed while the push was on its way. */
  duringInsert: (() => Promise<void>) | null = null;

  private now() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  async insert(table: SyncedTable, rows: (RemoteFields & { id: string })[]) {
    if (rows.some((row) => this.rows[table].has(row.id))) throw new DuplicateError();
    const during = this.duringInsert;
    this.duringInsert = null;
    await during?.();
    return rows.map((row) => {
      const stored = { ...row, version: 1, updated_at: this.now() } as RemoteRow;
      this.rows[table].set(row.id, stored);
      return stored;
    });
  }

  async update(table: SyncedTable, id: string, fields: RemoteFields, version: number) {
    const row = this.rows[table].get(id);
    if (!row || row.version !== version) return null;
    const stored = { ...row, ...fields, version: version + 1, updated_at: this.now() } as RemoteRow;
    this.rows[table].set(id, stored);
    return stored;
  }

  async get(table: SyncedTable, id: string) {
    return this.rows[table].get(id) ?? null;
  }

  async changedSince(table: SyncedTable, since: string | null) {
    return [...this.rows[table].values()].filter((row) => since === null || row.updated_at > since);
  }

  /** Another device changes a song. */
  changeSong(id: string, change: Partial<RemoteSong>) {
    const row = this.rows.songs.get(id) as RemoteSong;
    this.rows.songs.set(id, { ...row, ...change, version: row.version + 1, updated_at: this.now() });
  }

  song(id: string) {
    return this.rows.songs.get(id) as RemoteSong | undefined;
  }
}

const USER = 'user-a';
let account: FakeAccount;
const open = new Set<string>();
const syncNow = () => sync(account, USER, (id) => open.has(id));
const song = (title: string) => ({ ...createTemplate(), title });

beforeEach(async () => {
  account = new FakeAccount();
  open.clear();
  await Promise.all([db.songs.clear(), db.setlists.clear(), db.deletions.clear(), db.conflicts.clear(), db.meta.clear()]);
});

describe('syncing', () => {
  it('uploads the songs and setlists made here, and marks them synced', async () => {
    const [grace] = await addSongs([song('Amazing Grace')]);
    const gig = await createSetlist();
    await updateSetlist(gig, (s) => addEntry(s, grace!));

    await syncNow();

    expect(account.song(grace!)?.title).toBe('Amazing Grace');
    expect((account.rows.setlists.get(gig) as { songs: unknown[] }).songs).toHaveLength(1);
    expect(await db.songs.get(grace!)).toMatchObject({ version: 1, dirty: 0 });
    expect(await db.setlists.get(gig)).toMatchObject({ version: 1, dirty: 0 });
  });

  it('pushes a change, and pulls a change made on another device', async () => {
    const [grace] = await addSongs([song('Amazing Grace')]);
    await syncNow();

    await saveSong(grace!, song('Amazing Grace (live)'));
    await syncNow();
    expect(account.song(grace!)).toMatchObject({ title: 'Amazing Grace (live)', version: 2 });

    account.changeSong(grace!, { title: 'Amazing Grace (acoustic)' });
    await syncNow();
    expect(await db.songs.get(grace!)).toMatchObject({ title: 'Amazing Grace (acoustic)', version: 3, dirty: 0 });
  });

  it('syncs a song\'s notes both ways', async () => {
    const [grace] = await addSongs([song('Amazing Grace')]);
    const note = { id: 'n1', text: 'Capo 2', column: 4, top: 30, printRow: 0.5 };
    await saveSong(grace!, song('Amazing Grace'), [note]);
    await syncNow();
    expect(account.song(grace!)).toMatchObject({ notes: [note] });

    account.changeSong(grace!, { notes: [{ ...note, text: 'Capo 3' }] });
    await syncNow();
    expect((await db.songs.get(grace!))?.notes?.[0]?.text).toBe('Capo 3');
  });

  it("doesn't add a guest's song again when the account already has the same song", async () => {
    // Another device added the sample songs as a guest and joined the account with them.
    const [first] = await addSongs([song('Amazing Grace'), song('Oh! Susanna')]);
    await syncNow();
    const accountGrace = first!;
    // This device, a guest too, has the same songs, a changed one and a setlist; now it joins the account.
    await Promise.all([db.songs.clear(), db.setlists.clear(), db.meta.clear()]);
    const [grace, , changed] = await addSongs([song('Amazing Grace'), song('Oh! Susanna'), song('Oh! Susanna (live)')]);
    const gig = await createSetlist();
    await updateSetlist(gig, (s) => addEntry(s, grace!));

    await syncNow();

    expect([...account.rows.songs.values()].map((r) => (r as RemoteSong).title).toSorted()).toEqual([
      'Amazing Grace', 'Oh! Susanna', 'Oh! Susanna (live)',
    ]);
    expect((await db.songs.toArray()).map((s) => s.id)).not.toContain(grace);
    expect(await db.songs.get(changed!)).toMatchObject({ dirty: 0 });
    expect((await db.setlists.get(gig))?.songs.map((e) => e.songId)).toEqual([accountGrace]);
    expect((account.rows.setlists.get(gig) as { songs: { songId: string }[] }).songs.map((e) => e.songId)).toEqual([accountGrace]);
  });

  it('keeps two identical guest songs when the account has only one of them', async () => {
    await addSongs([song('Amazing Grace')]);
    await syncNow();
    await Promise.all([db.songs.clear(), db.meta.clear()]);
    await addSongs([song('Amazing Grace'), song('Amazing Grace')]);
    await syncNow();
    expect(account.rows.songs.size).toBe(2);
    expect(await db.songs.count()).toBe(2);
  });

  it('brings in songs added on another device', async () => {
    account.rows.songs.set('new', {
      id: 'new', title: 'Oh! Susanna', artist: '', key: 'C', text: 'Oh! Susanna\n', notes: [], deleted: false, version: 1,
      updated_at: '2026-10-03T13:00:00.000Z',
    });
    await syncNow();
    expect(await db.songs.get('new')).toMatchObject({ title: 'Oh! Susanna', version: 1, dirty: 0 });
  });

  it('turns a song changed in both places into a conflict, and keeps the copy chosen', async () => {
    const [grace] = await addSongs([song('Amazing Grace')]);
    await syncNow();
    account.changeSong(grace!, { title: 'Changed there' });
    await saveSong(grace!, song('Changed here'));

    await syncNow();
    const [conflict] = await db.conflicts.toArray();
    expect(conflict).toMatchObject({ id: grace, table: 'songs' });
    expect(account.song(grace!)?.title).toBe('Changed there');
    expect((await db.songs.get(grace!))?.title).toBe('Changed here');

    await keepThisDevice(conflict!);
    await syncNow();
    expect(account.song(grace!)?.title).toBe('Changed here');
    expect(await db.conflicts.count()).toBe(0);
  });

  it('can settle a conflict with the account\'s copy', async () => {
    const [grace] = await addSongs([song('Amazing Grace')]);
    await syncNow();
    account.changeSong(grace!, { title: 'Changed there' });
    await saveSong(grace!, song('Changed here'));
    await syncNow();

    await keepAccount((await db.conflicts.toArray())[0]!);
    expect(await db.songs.get(grace!)).toMatchObject({ title: 'Changed there', dirty: 0 });
    await syncNow();
    expect(account.song(grace!)?.title).toBe('Changed there');
  });

  it('deletes in the account what was deleted here, and here what was deleted elsewhere', async () => {
    const [grace, house] = await addSongs([song('Amazing Grace'), song('House of the Rising Sun')]);
    await syncNow();

    await deleteSong(grace!);
    account.changeSong(house!, { deleted: true, text: '' });
    await syncNow();

    expect(account.song(grace!)?.deleted).toBe(true);
    expect(await db.songs.get(house!)).toBeUndefined();
    expect(await db.deletions.count()).toBe(0);
  });

  it('keeps a song that was changed in one place and deleted in the other', async () => {
    const [grace, house] = await addSongs([song('Amazing Grace'), song('House of the Rising Sun')]);
    await syncNow();

    // Deleted here, changed there: the changed copy comes back.
    await deleteSong(grace!);
    account.changeSong(grace!, { title: 'Amazing Grace (changed)' });
    // Changed here, deleted there: the change brings it back in the account.
    await saveSong(house!, song('House (changed)'));
    account.changeSong(house!, { deleted: true });
    await syncNow();
    await syncNow();

    expect((await db.songs.get(grace!))?.title).toBe('Amazing Grace (changed)');
    expect(account.song(house!)).toMatchObject({ title: 'House (changed)', deleted: false });
    expect((await db.songs.get(house!))?.dirty).toBe(0);
  });

  it('waits until a song is closed in the editor before taking its change', async () => {
    const [grace] = await addSongs([song('Amazing Grace')]);
    await syncNow();
    account.changeSong(grace!, { title: 'Changed there' });

    open.add(grace!);
    await syncNow();
    expect((await db.songs.get(grace!))?.title).toBe('Amazing Grace');

    open.delete(grace!);
    await syncNow();
    expect((await db.songs.get(grace!))?.title).toBe('Changed there');
  });

  it('keeps a change made while it was being pushed, to push it next time', async () => {
    const [grace] = await addSongs([song('Amazing Grace')]);
    account.duringInsert = () => saveSong(grace!, song('Typed meanwhile'));
    await syncNow();
    expect(await db.songs.get(grace!)).toMatchObject({ version: 1, dirty: 1 });

    await syncNow();
    expect(account.song(grace!)).toMatchObject({ title: 'Typed meanwhile', version: 2 });
    expect((await db.songs.get(grace!))?.dirty).toBe(0);
  });

  it('recognizes songs already in the account when an earlier push lost its answer', async () => {
    const [grace] = await addSongs([parseSongText('Amazing Grace\n')]);
    const stored = await db.songs.get(grace!);
    await account.insert('songs', [{ id: grace!, title: stored!.title, artist: '', key: '', text: stored!.text, notes: [], deleted: false }]);

    await syncNow();
    expect(await db.songs.get(grace!)).toMatchObject({ version: 1, dirty: 0 });
    expect(await db.conflicts.count()).toBe(0);
  });

  it('refuses to sync a library that belongs to another account', async () => {
    await syncNow();
    await expect(sync(account, 'user-b', () => false)).rejects.toThrow('another account');
  });
});
