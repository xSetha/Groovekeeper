// Syncing against the local Supabase (`npm run db:start` in web/), with real accounts and row-level security.
// Skipped when the local Supabase isn't running, so `npm test` works without Docker.
import { createTemplate } from '@groovekeeper/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/library/db';
import { addSongs, saveSong } from '../src/library/library';
import { supabaseRemote } from '../src/sync/remote';
import { sync } from '../src/sync/sync';

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const running = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: KEY } }).then((r) => r.ok, () => false);

/** A new account, signed in on its own client. */
async function signUp(): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(URL, KEY, { auth: { persistSession: false } });
  const email = `test-${crypto.randomUUID()}@example.com`;
  const { data, error } = await client.auth.signUp({ email, password: 'correct horse battery' });
  if (error || !data.user) throw error ?? new Error('No user');
  return { client, userId: data.user.id };
}

describe.runIf(running)('syncing with Supabase', () => {
  let a: Awaited<ReturnType<typeof signUp>>;
  let b: Awaited<ReturnType<typeof signUp>>;

  beforeAll(async () => {
    [a, b] = await Promise.all([signUp(), signUp()]);
  });

  beforeEach(async () => {
    await Promise.all([db.songs.clear(), db.setlists.clear(), db.deletions.clear(), db.conflicts.clear(), db.meta.clear()]);
  });

  it('uploads, changes, and keeps each account\'s songs to itself', async () => {
    const [id] = await addSongs([{ ...createTemplate(), title: 'Amazing Grace' }]);
    await sync(supabaseRemote(a.client), a.userId, () => false);

    const { data: mine } = await a.client.from('songs').select('title, version').eq('id', id!);
    expect(mine).toEqual([{ title: 'Amazing Grace', version: 1 }]);
    const { data: theirs } = await b.client.from('songs').select('id').eq('id', id!);
    expect(theirs).toEqual([]);

    await saveSong(id!, { ...createTemplate(), title: 'Amazing Grace (live)' });
    await sync(supabaseRemote(a.client), a.userId, () => false);
    const { data: changed } = await a.client.from('songs').select('title, version').eq('id', id!);
    expect(changed).toEqual([{ title: 'Amazing Grace (live)', version: 2 }]);
    expect(await db.songs.get(id!)).toMatchObject({ version: 2, dirty: 0 });
  });

  it('turns a save made from an old copy into a conflict', async () => {
    const [id] = await addSongs([{ ...createTemplate(), title: 'House of the Rising Sun' }]);
    await sync(supabaseRemote(a.client), a.userId, () => false);
    // Another device of the same account saves first.
    await a.client.from('songs').update({ title: 'Changed there' }).eq('id', id!);

    await saveSong(id!, { ...createTemplate(), title: 'Changed here' });
    await sync(supabaseRemote(a.client), a.userId, () => false);
    expect(await db.conflicts.get(id!)).toMatchObject({ table: 'songs', remote: { title: 'Changed there', version: 2 } });
  });

  it('cannot push a song into another account', async () => {
    const [id] = await addSongs([{ ...createTemplate(), title: 'Scarborough Fair' }]);
    await sync(supabaseRemote(a.client), a.userId, () => false);

    // B tries to overwrite A's song by its id: the database lets B see and change nothing of A's.
    const { data } = await b.client.from('songs').update({ title: 'Taken' }).eq('id', id!).select('id');
    expect(data).toEqual([]);
    const { data: still } = await a.client.from('songs').select('title').eq('id', id!);
    expect(still).toEqual([{ title: 'Scarborough Fair' }]);
  });
});
