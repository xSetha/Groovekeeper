// The account's own logic (src/sync/account.ts): the guest library question, signing out, one sync at a
// time, trying again after a failure, and songs open in other tabs. Supabase and the sync algorithm are
// stand-ins here; they have their own tests (sync.test.ts, sync-supabase.test.ts).
import { createTemplate } from '@groovekeeper/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthCallback = (event: string, session: { user: { id: string; email: string } } | null) => void;

const supabase = vi.hoisted(() => {
  // failImport: the next load of the Supabase client fails, as when its file is gone after a deploy.
  // userGone: the server says the session's account no longer exists (deleted on another device).
  const state = { onAuth: null as AuthCallback | null, failImport: false, userGone: false };
  const client = {
    auth: {
      onAuthStateChange: (callback: AuthCallback) => {
        state.onAuth = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signInWithPassword: async () => ({ error: null }),
      signOut: async (_options?: { scope: string }) => ({ error: null }),
      getUser: async () => (state.userGone ? { data: { user: null }, error: { code: 'user_not_found' } } : { data: { user: {} }, error: null }),
    },
    rpc: async (_name: string) => ({ error: null as { message: string } | null }),
  };
  return { state, client };
});

vi.mock('@supabase/supabase-js', () => {
  if (supabase.state.failImport) {
    supabase.state.failImport = false;
    throw new TypeError('Failed to fetch dynamically imported module');
  }
  return { createClient: () => supabase.client };
});
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
  await Promise.all([db.songs.clear(), db.setlists.clear(), db.deletions.clear(), db.deletionLog.clear(), db.conflicts.clear(), db.meta.clear()]);
  return { account, db, library, setlists, sync: vi.mocked(sync) };
}

/** Signs in as `id`, the way Supabase reports it. */
async function signInAs(account: Awaited<ReturnType<typeof load>>['account'], id: string) {
  await account.signIn('me@example.com', 'correct horse', 'test-token');
  supabase.state.onAuth?.('SIGNED_IN', { user: { id, email: 'me@example.com' } });
  await vi.waitFor(() => expect(account.accountStore.getState().userId).toBe(id));
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'locks');
});

describe('an email link that didn\'t work', () => {
  it('is read from the address at start, and taken out of it', async () => {
    history.replaceState(null, '', '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    const { account } = await load();
    account.startAccount();
    expect(account.accountStore.getState().linkError).toEqual({ code: 'otp_expired', expired: true });
    expect(location.hash).toBe('');
    history.replaceState(null, '', '/');
  });

  it('leaves other addresses with an error alone', async () => {
    history.replaceState(null, '', '/?error=something');
    const { account } = await load();
    account.startAccount();
    expect(account.accountStore.getState().linkError).toBeNull();
    expect(location.search).toBe('?error=something');
    history.replaceState(null, '', '/');
  });
});


describe('loading the Supabase client', () => {
  it('tries again on the next sign-in after it failed to load', async () => {
    const { account } = await load();
    supabase.state.failImport = true;

    expect(await account.signIn('me@example.com', 'long enough', 'test-token')).toHaveProperty('error');
    expect(await account.signIn('me@example.com', 'long enough', 'test-token')).toBeNull();
  });
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

  it('deletes the account and empties the library on this device', async () => {
    const rpc = vi.spyOn(supabase.client, 'rpc');
    await t.library.addSongs([createTemplate()]);

    expect(await t.account.deleteAccount()).toBeNull();
    expect(rpc).toHaveBeenCalledWith('delete_account');
    expect([await t.db.songs.count(), await t.db.meta.count()]).toEqual([0, 0]);
    expect(t.account.accountStore.getState()).toMatchObject({ status: 'guest', userId: null, endedSession: null });
  });

  it('keeps everything when deleting the account fails, or the device is offline', async () => {
    await t.library.addSongs([createTemplate()]);
    vi.spyOn(supabase.client, 'rpc').mockResolvedValueOnce({ error: { message: 'The server is down' } });
    expect(await t.account.deleteAccount()).toEqual({ error: 'Couldn’t delete your account: The server is down' });

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValueOnce(false);
    expect(await t.account.deleteAccount()).toEqual({ error: 'You’re offline. Connect to the internet to delete your account.' });
    expect(await t.db.songs.count()).toBe(1);
    expect(t.account.accountStore.getState().status).toBe('signedIn');
  });

  it('empties the library when a sync finds the account deleted elsewhere, and says so', async () => {
    await t.library.addSongs([createTemplate()]);
    supabase.state.userGone = true;
    t.sync.mockRejectedValueOnce(new Error('insert or update on table "songs" violates foreign key constraint'));
    try {
      await t.account.runSync();
      expect(await t.db.songs.count()).toBe(0);
      expect(t.account.accountStore.getState()).toMatchObject({ status: 'guest', endedSession: null });
    } finally {
      supabase.state.userGone = false;
    }
  });

  it('keeps the library when a sync fails for another reason', async () => {
    await t.library.addSongs([createTemplate()]);
    t.sync.mockRejectedValueOnce(new Error('The server is down'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await t.account.runSync();
    expect(await t.db.songs.count()).toBe(1);
    expect(t.account.accountStore.getState().status).toBe('signedIn');
  });

  it('doesn\'t let a sync still running write songs back after signing out', async () => {
    let finish = () => {};
    t.sync.mockImplementationOnce(async () => {
      await new Promise<void>((done) => (finish = done));
      await t.db.songs.put({ id: 'pulled', title: 'Pulled', artist: '', key: '', text: '', notes: [], updatedAt: 1, version: 1, dirty: 0 });
    });
    const syncing = t.account.runSync();
    await vi.waitFor(() => expect(t.sync).toHaveBeenCalled());

    const leaving = t.account.signOut();
    finish();
    await Promise.all([syncing, leaving]);
    expect([await t.db.songs.count(), await t.db.meta.count()]).toEqual([0, 0]);
  });

  it('asks to remove another account\'s songs when a different account signs in, or to keep them', async () => {
    await t.library.addSongs([createTemplate()]);
    supabase.state.onAuth?.('SIGNED_OUT', null);
    await vi.waitFor(() => expect(t.account.accountStore.getState().endedSession).not.toBeNull());

    await signInAs(t.account, 'user-2');
    await vi.waitFor(() => expect(t.account.accountStore.getState().guestLibrary).toMatchObject({
      songs: 1, otherAccount: { email: 'me@example.com' },
    }));
    // Adding isn't offered; settling removes them either way.
    await t.account.settleGuestLibrary(true);
    expect(await t.db.songs.count()).toBe(0);
    expect((await t.db.meta.get('sync'))?.userId).toBe('user-2');
  });

  it('keeps the library when the session ends on its own, and asks to sign in again', async () => {
    await t.library.addSongs([createTemplate()]);
    supabase.state.onAuth?.('SIGNED_OUT', null);

    await vi.waitFor(() => expect(t.account.accountStore.getState().endedSession).toEqual({ email: 'me@example.com' }));
    expect(t.account.accountStore.getState().status).toBe('guest');
    expect(await t.db.songs.count()).toBe(1);

    await t.account.forgetEndedSession();
    expect([await t.db.songs.count(), await t.db.meta.count()]).toEqual([0, 0]);
    expect(t.account.accountStore.getState().endedSession).toBeNull();
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

describe('what went wrong signing in', () => {
  it('says how long to wait before asking for another email to the same address', async () => {
    const { account } = await load();
    vi.spyOn(supabase.client.auth, 'signInWithPassword').mockResolvedValueOnce({
      error: { code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 52 seconds.' },
    } as never);
    expect(await account.signIn('me@example.com', 'x', 'token')).toMatchObject({
      error: 'An email was sent to this address just now. Wait 52 seconds and try again.',
    });
  });
});

describe('changing the email', () => {
  it('says another account uses the address, in words for someone signed in', async () => {
    const { account } = await load();
    (supabase.client.auth as Record<string, unknown>).updateUser = async () => ({
      data: { user: null },
      error: { code: 'email_exists', message: 'A user with this email address has already been registered' },
    });
    expect(await account.changeEmail('taken@example.com')).toMatchObject({
      error: 'Another account uses that email. Choose a different one.',
    });
  });
});
