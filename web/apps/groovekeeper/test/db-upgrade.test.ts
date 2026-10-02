// A library saved by an older version must open in this one. This file builds a version 2 database first,
// then loads the app's database code, which upgrades it.
import Dexie from 'dexie';
import { expect, it } from 'vitest';

it('gives the songs of setlists from version 2 their own ids, keeping everything else', async () => {
  const old = new Dexie('groovekeeper');
  old.version(2).stores({ songs: 'id, title', setlists: 'id, name' });
  await old.table('setlists').add({
    id: 'gig',
    name: 'Friday gig',
    updatedAt: 0,
    songs: [{ songId: 'grace', key: 'A' }, { songId: 'grace', key: '' }],
  });
  old.close();

  const { db } = await import('../src/library/db');
  const setlist = await db.setlists.get('gig');

  expect(setlist?.name).toBe('Friday gig');
  expect(setlist?.songs.map(({ songId, key }) => ({ songId, key }))).toEqual([
    { songId: 'grace', key: 'A' },
    { songId: 'grace', key: '' },
  ]);
  const [first, second] = setlist?.songs ?? [];
  expect(first?.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(second?.id).not.toBe(first?.id);
});
