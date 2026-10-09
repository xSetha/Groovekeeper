import { createTemplate, parseSongText } from '@groovekeeper/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type RemoteRow, type RemoteSong, type SyncedTable } from '../src/library/db';
import { addSongs, deleteSong, saveSong } from '../src/library/library';
import { addEntry, createSetlist, updateSetlist } from '../src/library/setlists';
import { DuplicateError, keepAccount, keepThisDevice, RefusedError, sync, type Remote, type RemoteFields } from '../src/sync/sync';

/** The account, kept in memory with the database's rules: versions count up, the server sets the time. */
class FakeAccount implements Remote {
  rows: Record<SyncedTable, Map<string, RemoteRow>> = { songs: new Map(), setlists: new Map() };
  private clock = Date.parse('2026-10-03T12:00:00Z');
  /** Runs once during the next insert, as if the user typed while the push was on its way. */
  duringInsert: (() => Promise<unknown>) | null = null;
  /** The database's limits, when a test sets them: how many rows an account keeps, how long a song may be. */
  limit: Partial<Record<SyncedTable, number>> = {};
  maxText = Infinity;
  /** How many rows each insert was asked to add, to see what was tried. */
  inserted: number[] = [];

  private live(table: SyncedTable) {
    return [...this.rows[table].values()].filter((row) => !row.deleted).length;
  }

  private check(table: SyncedTable, fields: RemoteFields[], adding: number) {
    if (fields.some((f) => 'text' in f && f.text.length > this.maxText)) throw new RefusedError('size');
    if (this.live(table) + adding > (this.limit[table] ?? Infinity)) throw new RefusedError('limit');
  }

  private now() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  async insert(table: SyncedTable, rows: (RemoteFields & { id: string })[]) {
    this.inserted.push(rows.length);
    if (rows.some((row) => this.rows[table].has(row.id))) throw new DuplicateError();
    this.check(table, rows, rows.length);
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
    if (!fields.deleted) this.check(table, [fields], row.deleted ? 1 : 0);
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

  epochValue = 'epoch-1';

  async epoch() {
    return this.epochValue;
  }

  /** The rows as they are now, to go back to with restore(). */
  backup() {
    return { songs: new Map(this.rows.songs), setlists: new Map(this.rows.setlists) };
  }

  /** The account is restored from a backup: the rows go back as they were, and the epoch changes. */
  restore(backup: ReturnType<FakeAccount['backup']>) {
    this.rows = { songs: new Map(backup.songs), setlists: new Map(backup.setlists) };
    this.epochValue = `epoch-${Number(this.epochValue.slice(6)) + 1}`;
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
  await Promise.all([db.songs.clear(), db.setlists.clear(), db.deletions.clear(), db.deletionLog.clear(), db.conflicts.clear(), db.meta.clear()]);
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

  describe('with the clock stopped, so a change and the one before it have the same time', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.parse('2026-10-06T12:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    it('keeps a change made while it was being pushed, to push it next time', async () => {
      const [grace] = await addSongs([song('Amazing Grace')]);
      account.duringInsert = () => saveSong(grace!, song('Typed meanwhile'));
      await syncNow();
      expect(await db.songs.get(grace!)).toMatchObject({ version: 1, dirty: 1 });

      await syncNow();
      expect(account.song(grace!)).toMatchObject({ title: 'Typed meanwhile', version: 2 });
      expect((await db.songs.get(grace!))?.dirty).toBe(0);
    });

    it('keeps a setlist changed while it was being pushed', async () => {
      const gig = await createSetlist();
      account.duringInsert = () => updateSetlist(gig, (s) => ({ ...s, name: 'Renamed meanwhile' }));
      await syncNow();
      expect(await db.setlists.get(gig)).toMatchObject({ version: 1, dirty: 1 });
    });
  });

  it('keeps a change made while it was being pushed, with the clock running', async () => {
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

describe('the sync record', () => {
  it('keeps the account\'s email, which asks for it again when the session ends', async () => {
    await db.meta.put({ key: 'sync', userId: USER, email: 'me@example.com', lastPulled: null, held: [] });
    await addSongs([song('Amazing Grace')]);
    await syncNow();
    expect(await db.meta.get('sync')).toMatchObject({ email: 'me@example.com', userId: USER });
  });
});

describe('what the account refuses', () => {
  it('uploads 200 of 250 guest songs, keeps the rest here marked, and doesn\'t try them on every sync', async () => {
    account.limit.songs = 200;
    await addSongs(Array.from({ length: 250 }, (_, i) => song(`Song ${i}`)));

    await syncNow();
    expect(account.rows.songs.size).toBe(200);
    const waiting = await db.songs.filter((row) => row.refused !== undefined).toArray();
    expect(waiting).toHaveLength(50);
    expect(waiting.every((row) => row.refused?.reason === 'limit' && row.version === 0 && row.dirty === 1)).toBe(true);

    account.inserted = [];
    await syncNow();
    expect(account.inserted).toEqual([]);
  });

  it('tries the waiting songs again once a song is deleted, and one fits', async () => {
    account.limit.songs = 2;
    const [a] = await addSongs([song('A')]);
    await syncNow(); // A is in the account; of B and C, one fits
    await addSongs([song('B'), song('C')]);
    await syncNow();
    expect(await db.songs.filter((row) => row.refused !== undefined).count()).toBe(1);

    await deleteSong(a!);
    await syncNow();
    expect(account.rows.songs.size).toBe(3); // A is kept, deleted
    expect(await db.songs.filter((row) => row.refused !== undefined).count()).toBe(0);
    expect(await db.songs.where('dirty').equals(1).count()).toBe(0);
  });

  it('keeps a song too long for the account here, pushes the others, and tries it again once it changes', async () => {
    account.maxText = 200;
    const [long] = await addSongs([parseSongText(`Long\n\n\nKey: G\n\n[Verse 1]\n${'la '.repeat(100)}\n`)]);
    const [short] = await addSongs([song('Short')]);

    await syncNow();
    expect(account.song(short!)?.title).toBe('Short');
    expect(account.song(long!)).toBeUndefined();
    expect((await db.songs.get(long!))?.refused?.reason).toBe('size');

    await saveSong(long!, song('Long, shorter'));
    await syncNow();
    expect(account.song(long!)?.title).toBe('Long, shorter');
    expect((await db.songs.get(long!))?.refused).toBeUndefined();
  });

  it('puts a song back that the account no longer remembers when it was changed here', async () => {
    const [grace] = await addSongs([song('Amazing Grace')]);
    await syncNow();
    account.rows.songs.delete(grace!); // deleted elsewhere over a month ago, its record cleared

    await saveSong(grace!, song('Amazing Grace (live)'));
    await syncNow();
    expect(account.song(grace!)?.title).toBe('Amazing Grace (live)');
  });
});

describe('after the account is restored from a backup', () => {
  afterEach(() => vi.useRealTimers());

  /** A device that has synced one song, and the account's state at that moment. */
  async function synced() {
    const [grace] = await addSongs([song('Amazing Grace')]);
    await syncNow();
    return { grace: grace!, backup: account.backup() };
  }

  it('notes the account\'s epoch at the first sync, and leaves everything alone while it is the same', async () => {
    await synced();
    expect((await db.meta.get('sync'))?.epoch).toBe('epoch-1');
    const inserts = account.inserted.length;
    await syncNow();
    expect(account.inserted).toHaveLength(inserts);
    expect((await db.songs.toArray())[0]?.version).toBe(1);
  });

  it('sends a song changed here since the backup over the account\'s older copy, without asking', async () => {
    const { grace, backup } = await synced();
    await saveSong(grace, { ...song('Amazing Grace (new words)') });
    await syncNow();
    account.restore(backup);
    expect(account.song(grace)?.title).toBe('Amazing Grace');

    await syncNow();

    expect(account.song(grace)?.title).toBe('Amazing Grace (new words)');
    expect(await db.conflicts.count()).toBe(0);
    const stored = await db.songs.get(grace);
    expect(stored?.dirty).toBe(0);
    expect(stored?.version).toBe(account.song(grace)?.version);
    expect((await db.meta.get('sync'))?.epoch).toBe('epoch-2');
  });

  it('sends a song made here since the backup, which the account lacks', async () => {
    const { backup } = await synced();
    const [newer] = await addSongs([song('Newer')]);
    await syncNow();
    account.restore(backup);
    expect(account.song(newer!)).toBeUndefined();

    await syncNow();

    expect(account.song(newer!)?.title).toBe('Newer');
    expect((await db.songs.get(newer!))?.dirty).toBe(0);
  });

  it('deletes again a song deleted here since the backup, and does not bring it back', async () => {
    const { grace, backup } = await synced();
    await deleteSong(grace);
    await syncNow();
    expect(account.song(grace)?.deleted).toBe(true);
    account.restore(backup);
    expect(account.song(grace)?.deleted).toBe(false);

    await syncNow();

    expect(account.song(grace)?.deleted).toBe(true);
    expect(await db.songs.get(grace)).toBeUndefined();
  });

  it('deletes again a deletion that was still waiting to be sent', async () => {
    const { grace, backup } = await synced();
    // The song changes after the backup, so the version this device deletes isn't the backup's.
    await saveSong(grace, { ...song('Amazing Grace (new words)') });
    await syncNow();
    await deleteSong(grace);
    account.restore(backup);

    await syncNow();

    expect(account.song(grace)?.deleted).toBe(true);
    expect(await db.songs.get(grace)).toBeUndefined();
    expect(await db.deletions.count()).toBe(0);
  });

  it('keeps what the backup has and this device never deleted, and takes in what only the account has', async () => {
    const { grace, backup } = await synced();
    // Another device made a song, and the backup has it; this device has not synced since.
    account.rows.songs.set('elsewhere', { id: 'elsewhere', title: 'Elsewhere', artist: '', key: '', text: '', notes: [],
      deleted: false, version: 1, updated_at: '2026-10-03T12:30:00.000Z' });
    const withElsewhere = account.backup();
    account.restore(withElsewhere);
    // And one that this device deleted a long time ago stays gone in the backup.
    await deleteSong(grace);
    await syncNow();
    account.restore({ songs: new Map(withElsewhere.songs), setlists: withElsewhere.setlists });

    await syncNow();

    expect(account.song('elsewhere')?.deleted).toBe(false);
    expect((await db.songs.get('elsewhere'))?.title).toBe('Elsewhere');
    expect(backup.songs.has(grace)).toBe(true);
    expect(account.song(grace)?.deleted).toBe(true);
  });

  it('leaves a song alone that another device brought back after this device deleted it', async () => {
    const { grace } = await synced();
    await deleteSong(grace);
    await syncNow();
    // Another device changes the song, which brings it back; the backup is made after that.
    account.changeSong(grace, { deleted: false, title: 'Brought back' });
    const backup = account.backup();
    account.restore(backup);

    await syncNow();

    expect(account.song(grace)).toMatchObject({ deleted: false, title: 'Brought back' });
    expect((await db.songs.get(grace))?.title).toBe('Brought back');
  });

  it('forgets a deletion after 90 days', async () => {
    const { grace } = await synced();
    await deleteSong(grace);
    await syncNow();
    expect(await db.deletionLog.count()).toBe(1);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 91 * 24 * 60 * 60 * 1000);
    await syncNow();
    expect(await db.deletionLog.count()).toBe(0);
  });

  it('settles a song changed in both places as usual when the account has a newer copy than the backup', async () => {
    const { grace, backup } = await synced();
    // Another device changes the song twice before the backup is made...
    account.changeSong(grace, { title: 'Version two' });
    account.changeSong(grace, { title: 'Version three' });
    const newer = account.backup();
    // ... and this device changes it too, without having seen them.
    await saveSong(grace, { ...song('Mine') });
    account.restore(newer);
    expect(backup.songs.get(grace)?.version).toBe(1);

    await syncNow();

    expect((await db.conflicts.toArray()).map((c) => c.id)).toEqual([grace]);
    expect(account.song(grace)?.title).toBe('Version three');
  });
});
