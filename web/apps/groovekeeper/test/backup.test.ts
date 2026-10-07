// Exporting the whole library as a zip and importing it again (src/library/backup.ts).
import { parseSongText } from '@groovekeeper/core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, type SongNote } from '../src/library/db';
import { exportLibrary, importZip } from '../src/library/backup';
import { addSongsWithNotes } from '../src/library/library';
import { addEntry, createSetlist, updateSetlist } from '../src/library/setlists';
import { accountStore } from '../src/sync/account';

const song = (title: string, line = 'la la la') => parseSongText(`${title}\n\n\nKey: G\n\n[Verse 1]\n${line}\n`);
const note = (text: string): SongNote => ({ id: 'n1', text, column: 2, top: 10, printRow: 0.5 });

const clear = () => Promise.all([db.songs.clear(), db.setlists.clear()]);

beforeEach(async () => {
  await clear();
  accountStore.setState({ status: 'guest', userId: null, email: null });
});

describe('exporting the library', () => {
  it('puts every song in the zip as a .txt file, two songs of the same title under two names', async () => {
    await addSongsWithNotes([{ song: song('Amazing Grace'), notes: [] }, { song: song('Amazing Grace', 'other'), notes: [] }]);
    const files = unzipSync((await exportLibrary()).data);
    expect(Object.keys(files).filter((name) => name.startsWith('Songs/')).toSorted()).toEqual([
      'Songs/Amazing Grace (2).txt',
      'Songs/Amazing Grace.txt',
    ]);
    expect(strFromU8(files['Songs/Amazing Grace.txt']!)).toContain('Amazing Grace');
  });

  it('brings back songs, notes and setlists into an empty library', async () => {
    const [grace, fair] = await addSongsWithNotes([
      { song: song('Amazing Grace'), notes: [note('Capo 2')] },
      { song: song('Scarborough Fair'), notes: [] },
    ]);
    const gig = await createSetlist();
    await updateSetlist(gig, (s) => addEntry(addEntry({ ...s, name: 'Friday gig' }, fair!), grace!));
    const { data } = await exportLibrary();
    await clear();

    const imported = await importZip(data);
    expect(imported).toMatchObject({ setlists: 1, skipped: 0, tooLong: [] });
    expect(imported.ids).toHaveLength(2);
    const songs = await db.songs.toArray();
    expect(songs.find((s) => s.title === 'Amazing Grace')?.notes).toEqual([note('Capo 2')]);
    const [setlist] = await db.setlists.toArray();
    const titles = await Promise.all(setlist!.songs.map(async (entry) => (await db.songs.get(entry.songId))?.title));
    expect([setlist!.name, ...titles]).toEqual(['Friday gig', 'Scarborough Fair', 'Amazing Grace']);
  });

  it('adds nothing twice when the same export is imported into the library it came from', async () => {
    const [grace] = await addSongsWithNotes([{ song: song('Amazing Grace'), notes: [note('Capo 2')] }]);
    const gig = await createSetlist();
    await updateSetlist(gig, (s) => addEntry(s, grace!));

    const imported = await importZip((await exportLibrary()).data);
    expect(imported).toMatchObject({ ids: [], setlists: 0, skipped: 1 });
    expect(await db.songs.count()).toBe(1);
    expect(await db.setlists.count()).toBe(1);
  });

  it('imports any zip of song files, leaving out songs too long to keep', async () => {
    const long = `Long\n\n\nKey: G\n\n[Verse 1]\n${'la la la la la la la la la la la la la l\n'.repeat(520)}`;
    const zip = zipSync({
      'My songs/Amazing Grace.txt': strToU8('Amazing Grace\n\n\nKey: G\n\n[Verse 1]\nla\n'),
      'My songs/Fair.cho': strToU8('{title: Scarborough Fair}\n[Am]Are you going\n'),
      'Long.txt': strToU8(long),
      'cover.jpg': new Uint8Array([1, 2, 3]),
    });
    const imported = await importZip(zip);
    expect(imported.ids).toHaveLength(2);
    expect(imported.tooLong).toEqual(['Long.txt']);
    expect((await db.songs.toArray()).map((s) => s.title).toSorted()).toEqual(['Amazing Grace', 'Scarborough Fair']);
  });

  it('adds nothing when a signed-in account has no room for the setlists', async () => {
    for (const name of ['Friday gig', 'Saturday gig']) await updateSetlist(await createSetlist(), (s) => ({ ...s, name }));
    const { data } = await exportLibrary();
    await clear();
    accountStore.setState({ status: 'signedIn', userId: 'me', email: 'me@example.com' });
    for (let i = 0; i < 19; i++) await createSetlist();
    await addSongsWithNotes([{ song: song('Amazing Grace'), notes: [] }]);

    await expect(importZip(data)).rejects.toMatchObject({ title: 'Your account holds up to 20 setlists' });
    expect([await db.setlists.count(), await db.songs.count()]).toEqual([19, 1]);
  });

  it('restores its own backup near the limit: setlists already here don\'t count', async () => {
    const [grace] = await addSongsWithNotes([{ song: song('Amazing Grace'), notes: [] }]);
    for (let i = 0; i < 10; i++) await updateSetlist(await createSetlist(), (s) => addEntry({ ...s, name: `Gig ${i}` }, grace!));
    const { data } = await exportLibrary();
    accountStore.setState({ status: 'signedIn', userId: 'me', email: 'me@example.com' });
    for (let i = 0; i < 9; i++) await createSetlist();

    expect(await importZip(data)).toMatchObject({ setlists: 0, skipped: 1 });
  });

  it('leaves out the hidden copies a Mac adds to a zip', async () => {
    const zip = zipSync({
      'Songs/Amazing Grace.txt': strToU8('Amazing Grace\n\n\nKey: G\n\n[Verse 1]\nla\n'),
      '__MACOSX/Songs/._Amazing Grace.txt': new Uint8Array([0, 5, 22, 7]),
      'Songs/.hidden.txt': strToU8('Hidden\n'),
    });
    expect((await importZip(zip)).ids).toHaveLength(1);
  });
});
