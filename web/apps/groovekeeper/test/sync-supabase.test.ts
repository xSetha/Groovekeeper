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

// The local Supabase checks a Turnstile token with Cloudflare's test secret, which takes this dummy token.
const CAPTCHA_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';
// The emails the local Supabase sends end up in Mailpit.
const MAILPIT = 'http://127.0.0.1:54324';

/** The confirmation link in the email sent to `email`, once it has arrived. */
async function confirmationLink(email: string): Promise<string> {
  for (let tries = 0; tries < 30; tries++) {
    const found = (await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json()) as {
      messages: { ID: string }[];
    };
    if (found.messages[0]) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${found.messages[0].ID}`)).json()) as { Text: string };
      const link = message.Text.match(/https?:\/\/\S+\/auth\/v1\/verify\S+/)?.[0];
      if (link) return link.replace(/[)\].,]+$/, '');
    }
    await new Promise((done) => setTimeout(done, 300));
  }
  throw new Error(`No confirmation email for ${email}`);
}

/** A new account, confirmed (as by opening the link in its email) and signed in on its own client. */
async function signUp(): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(URL, KEY, { auth: { persistSession: false } });
  const email = `test-${crypto.randomUUID()}@example.com`;
  const { data, error } = await client.auth.signUp({ email, password: 'correct horse battery', options: { captchaToken: CAPTCHA_TOKEN } });
  if (error || !data.user) throw error ?? new Error('No user');
  // The link confirms the account and redirects with the new session in the address.
  const answer = await fetch(await confirmationLink(email), { redirect: 'manual' });
  const session = new URLSearchParams(new globalThis.URL(answer.headers.get('location') ?? '').hash.slice(1));
  const { error: signingIn } = await client.auth.setSession({
    access_token: session.get('access_token') ?? '',
    refresh_token: session.get('refresh_token') ?? '',
  });
  if (signingIn) throw signingIn;
  return { client, userId: data.user.id };
}

describe.runIf(running)('syncing with Supabase', () => {
  let a: Awaited<ReturnType<typeof signUp>>;
  let b: Awaited<ReturnType<typeof signUp>>;

  beforeAll(async () => {
    [a, b] = await Promise.all([signUp(), signUp()]);
  });

  beforeEach(async () => {
    await Promise.all([db.songs.clear(), db.setlists.clear(), db.deletions.clear(), db.deletionLog.clear(), db.conflicts.clear(), db.meta.clear()]);
  });

  it('deletes an account with its songs, and then tells its old session the account is gone', async () => {
    const d = await signUp();
    await addSongs([{ ...createTemplate(), title: 'Amazing Grace' }]);
    await sync(supabaseRemote(d.client), d.userId, () => false);

    const { error: deleting } = await d.client.rpc('delete_account');
    expect(deleting).toBeNull();
    // An answer lost on the way: deleting again does nothing.
    expect((await d.client.rpc('delete_account')).error).toBeNull();

    const { error } = await d.client.auth.getUser();
    expect(error?.code).toBe('user_not_found');
    const { data: songs } = await d.client.from('songs').select('id');
    expect(songs).toEqual([]);
  });

  it('uploads 200 songs of a new account and keeps the 201st here, refused for the limit', async () => {
    const c = await signUp();
    const ids = await addSongs(Array.from({ length: 201 }, (_, i) => ({ ...createTemplate(), title: `Song ${i}` })));
    await sync(supabaseRemote(c.client), c.userId, () => false);

    const { count } = await c.client.from('songs').select('id', { count: 'exact', head: true });
    expect(count).toBe(200);
    const refused = await db.songs.filter((row) => row.refused !== undefined).toArray();
    expect(refused.map((row) => [row.refused?.reason, ids.includes(row.id)])).toEqual([['limit', true]]);
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

  it('notes the database\'s restore marker, and goes through a sync when it has changed', async () => {
    const [id] = await addSongs([{ ...createTemplate(), title: 'Amazing Grace' }]);
    await sync(supabaseRemote(a.client), a.userId, () => false);
    const epoch = (await db.meta.get('sync'))?.epoch;
    expect(epoch).toMatch(/^[0-9a-f-]{36}$/);

    // As if the database had been restored since: this device's marker is another one.
    await db.meta.put({ ...(await db.meta.get('sync'))!, epoch: 'before the restore' });
    await saveSong(id!, { ...createTemplate(), title: 'Amazing Grace (live)' });
    await sync(supabaseRemote(a.client), a.userId, () => false);

    expect((await db.meta.get('sync'))?.epoch).toBe(epoch);
    expect(await db.songs.get(id!)).toMatchObject({ title: 'Amazing Grace (live)', dirty: 0 });
    const { data } = await a.client.from('songs').select('title').eq('id', id!);
    expect(data).toEqual([{ title: 'Amazing Grace (live)' }]);
    expect(await db.conflicts.count()).toBe(0);
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
