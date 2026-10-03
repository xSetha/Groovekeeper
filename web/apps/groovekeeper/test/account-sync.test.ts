// The account's own logic (src/sync/account.ts): the guest library question, signing out, one sync at a
// time, trying again after a failure, and songs open in other tabs. Supabase and the sync algorithm are
// stand-ins here; they have their own tests (sync.test.ts, sync-supabase.test.ts).
import { createTemplate } from '@groovekeeper/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthCallback = (event: string, session: { user: { id: string; email: string } } | null) => void;

const supabase = vi.hoisted(() => {
  const state = { onAuth: null as AuthCallback | null };
  const client = {
    auth: {
      onAuthStateChange: (callback: AuthCallback) => {
        state.onAuth = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signInWithPassword: async () => ({ error: null }),
      signOut: async (_options?: { scope: string }) => ({ error: null }),
    },
  };
  return { state, client };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: () => supabase.client }));
vi.mock('../src/sync/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/sync/sync')>()),
  sync: vi.fn(() => Promise.resolve()),
}));

// A fresh copy of the modules for each test: account.ts keeps its state (client, timers) in the module.
async function load() {
  vi.resetModules();
  const account = await import('../src/sync/account');
  const { db } = await import('../src/library/db');
  const library = await import('../src/library/library');
  const setlists = await import('../src/library/setlists');
  const { sync } = await import('../src/sync/sync');
  await Promise.all([db.songs.clear(), db.setlists.clear(), db.deletions.clear(), db.conflicts.clear(), db.meta.clear()]);
  return { account, db, library, setlists, sync: vi.mocked(sync) };
}

/** Signs in as `id`, the way Supabase reports it. */
async function signInAs(account: Awaited<ReturnType<typeof load>>['account'], id: string) {
  await account.signIn('me@example.com', 'correct horse');
  supabase.state.onAuth?.('SIGNED_IN', { user: { id, email: 'me@example.com' } });
  await vi.waitFor(() => expect(account.accountStore.getState().userId).toBe(id));
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'locks');
});

describe('signing in with a library made as a guest', () => {
  let t: Awaited<ReturnType<typeof load>>;
  beforeEach(async () => {
    t = await load();
  });

  it('asks first, and doesn\'t sync until it\'s answered; Add keeps everything and syncs', async () => {
    await t.library.addSongs([createTemplate(), createTemplate()]);
    await t.setlists.createSetlist();
    await signInAs(t.account, 'user-1');

    await vi.waitFor(() => expect(t.account.accountStore.getState().guestLibrary).toEqual({ songs: 2, setlists: 1 }));
    await t.account.runSync();
    expect(t.sync).not.toHaveBeenCalled();

    await t.account.settleGuestLibrary(true);
    expect(await t.db.songs.count()).toBe(2);
    expect((await t.db.meta.get('sync'))?.userId).toBe('user-1');
    await vi.waitFor(() => expect(t.sync).toHaveBeenCalledWith(expect.anything(), 'user-1', expect.any(Function)));
  });

  it('removes the guest library from this device when the user says not to add it', async () => {
    await t.library.addSongs([createTemplate()]);
    await t.setlists.createSetlist();
    await signInAs(t.account, 'user-1');
    await vi.waitFor(() => expect(t.account.accountStore.getState().guestLibrary).not.toBeNull());

    await t.account.settleGuestLibrary(false);
    expect([await t.db.songs.count(), await t.db.setlists.count()]).toEqual([0, 0]);
    expect((await t.db.meta.get('sync'))?.userId).toBe('user-1');
  });

  it('doesn\'t ask when nothing was made as a guest', async () => {
    await signInAs(t.account, 'user-1');
    await vi.waitFor(() => expect(t.sync).toHaveBeenCalled());
    expect(t.account.accountStore.getState().guestLibrary).toBeNull();
  });
});

describe('signed in', () => {
  let t: Awaited<ReturnType<typeof load>>;
  beforeEach(async () => {
    t = await load();
    await signInAs(t.account, 'user-1');
    await vi.waitFor(() => expect(t.sync).toHaveBeenCalled());
    t.sync.mockClear();
  });

  it('signs out by ending the session here and emptying the library on this device', async () => {
    const signOut = vi.spyOn(supabase.client.auth, 'signOut');
    await t.library.addSongs([createTemplate()]);
    await t.db.deletions.put({ id: 'gone', table: 'songs', version: 2 });

    await t.account.signOut();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    const counts = await Promise.all([t.db.songs.count(), t.db.setlists.count(), t.db.deletions.count(), t.db.meta.count()]);
    expect(counts).toEqual([0, 0, 0, 0]);
    expect(t.account.accountStore.getState()).toMatchObject({ status: 'guest', userId: null });
  });

  it('runs one sync at a time, and the one asked for meanwhile right after', async () => {
    let finish = () => {};
    t.sync.mockImplementationOnce(() => new Promise<void>((done) => (finish = done)));

    const first = t.account.runSync();
    await vi.waitFor(() => expect(t.sync).toHaveBeenCalledTimes(1));
    void t.account.runSync();
    expect(t.sync).toHaveBeenCalledTimes(1);

    finish();
    await first;
    await vi.waitFor(() => expect(t.sync).toHaveBeenCalledTimes(2));
  });

  it('tries again by itself after a failed sync', async () => {
    t.sync.mockRejectedValueOnce(new Error('The server is down'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await t.account.runSync();
    expect(t.account.accountStore.getState().sync).toBe('failed');
    expect(t.sync).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(t.sync).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(t.account.accountStore.getState().sync).toBe('idle'));
  });

  it('doesn\'t replace songs open in the editor in any tab', async () => {
    const requests: { name: string; mode?: string }[] = [];
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        // Another tab has 'other-tab' open.
        query: async () => ({ held: [{ name: 'groovekeeper.song:other-tab' }], pending: [] }),
        request: async (name: string, ...rest: unknown[]) => {
          const callback = rest.at(-1) as () => unknown;
          requests.push({ name, mode: (rest.length > 1 ? (rest[0] as { mode?: string }) : {}).mode });
          return callback();
        },
      },
    });

    const close = t.account.holdOpenSong('this-tab');
    expect(requests).toContainEqual({ name: 'groovekeeper.song:this-tab', mode: 'shared' });
    expect([...(await t.account.openSongIds())].toSorted()).toEqual(['other-tab', 'this-tab']);

    await t.account.runSync();
    const isOpen = t.sync.mock.calls[0]![2];
    expect([isOpen('other-tab'), isOpen('this-tab'), isOpen('closed')]).toEqual([true, true, false]);
    expect(requests.map((r) => r.name)).toContain('groovekeeper.sync');
    close();
  });
});
