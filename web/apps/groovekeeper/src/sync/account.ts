// The account this browser is signed in to, and syncing the library with it. Guests never load the Supabase
// client: it's loaded when someone signs in, or at start when this browser was signed in before.
import type { AuthError, Session, SupabaseClient } from '@supabase/supabase-js';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { db } from '../library/db';
import { toast } from '../toasts';
import { READ_ONLY, RemoteError, supabaseRemote } from './remote';
import { sync } from './sync';

// Where the Supabase client keeps the session; its presence says a client is worth loading at start.
const SESSION_KEY = 'groovekeeper.auth';
// A change is synced this long after the last one, so typing doesn't sync on every word.
const SYNC_DELAY_MS = 3000;
// After a failed sync it tries again this long after, doubling each time up to the longest wait.
const RETRY_FIRST_MS = 30_000;
const RETRY_LONGEST_MS = 5 * 60_000;

/** `unavailable`: the account's database takes no changes for now (its storage is full, or it's paused). */
/**
 * What's on this device when an account signs in: made as a guest, or synced with another account whose
 * session ended here (`otherAccount`, with its email if known); those are only removed, never added.
 */
export interface GuestLibrary {
  songs: number;
  setlists: number;
  otherAccount?: { email: string | null };
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'failed' | 'unavailable';

export interface AccountState {
  /** 'starting' until it's known whether this browser is signed in. */
  status: 'starting' | 'guest' | 'signedIn';
  email: string | null;
  userId: string | null;
  sync: SyncStatus;
  /** When the library last finished syncing (this browser's clock). */
  lastSynced: number | null;
  /** Set after signing in while the library holds what was made as a guest: how much, until the user decides. */
  guestLibrary: GuestLibrary | null;
  /** Opened from a password reset link: the user sets a new password. */
  resettingPassword: boolean;
  /**
   * Set when this device's session ended without signing out here (signed out everywhere, or the account
   * deleted elsewhere): the library is still the account's, until the user signs in again or removes it.
   */
  endedSession: { email: string | null } | null;
}

function hasStoredSession(): boolean {
  try {
    return localStorage.getItem(SESSION_KEY) !== null;
  } catch {
    return false; // storage blocked: nobody can stay signed in, so there's nothing to restore
  }
}

/** Whether the page was opened from a link in one of the account's emails (confirm, reset password). */
const openedFromEmail = (): boolean => /access_token|error_description/.test(location.hash) || /[?&]code=/.test(location.search);

/** Whether to load the Supabase client at start: this browser was signed in, or an email link was opened. */
const needsClient = (): boolean => hasStoredSession() || openedFromEmail();

export const accountStore = createStore<AccountState>(() => ({
  status: needsClient() ? 'starting' : 'guest',
  email: null,
  userId: null,
  sync: 'idle',
  lastSynced: null,
  guestLibrary: null,
  resettingPassword: false,
  endedSession: null,
}));

export const useAccount = <T>(select: (state: AccountState) => T): T => useStore(accountStore, select);

// ---- The Supabase client ----

let client: Promise<SupabaseClient> | null = null;

function getClient(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(
    ({ createClient }) =>
      createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string, {
        auth: { storageKey: SESSION_KEY },
      }),
    (error: unknown) => {
      // Not loaded (offline, or a file gone after a deploy): the next call tries again.
      client = null;
      throw error;
    },
  );
  return client;
}

// ---- Songs open in the editor: syncing doesn't replace them while they're open ----
//
// The library is shared by every tab of the app, so a song open in one tab must not be replaced by a sync
// in another. Each open song holds a Web Lock, which every tab can see. Web Locks exist only on HTTPS pages
// and localhost (not on the plain-http address used to test on a phone, where nothing is edited); this
// tab's own list covers it there.

const SONG_LOCK = 'groovekeeper.song:';
const SYNC_LOCK = 'groovekeeper.sync';
const openSongs = new Set<string>();

/** The editor holds this song; call the returned function when it's closed. */
export function holdOpenSong(id: string): () => void {
  openSongs.add(id);
  let closed = false;
  let release: (() => void) | undefined;
  // Shared: two tabs may have the same song open.
  void navigator.locks
    ?.request(`${SONG_LOCK}${id}`, { mode: 'shared' }, () => (closed ? undefined : new Promise<void>((done) => (release = done))))
    .catch(() => undefined);
  return () => {
    closed = true;
    release?.();
    openSongs.delete(id);
    scheduleSync(); // its change from the account, if any, can come in now
  };
}

/** The songs open in the editor in any tab of the app. */
export async function openSongIds(): Promise<Set<string>> {
  const open = new Set(openSongs);
  const locks = await navigator.locks?.query().catch(() => undefined);
  for (const lock of [...(locks?.held ?? []), ...(locks?.pending ?? [])]) {
    if (lock.name?.startsWith(SONG_LOCK)) open.add(lock.name.slice(SONG_LOCK.length));
  }
  return open;
}

// ---- Starting, signing in and out ----

/** Called once when the app starts. */
export function startAccount(): void {
  if (needsClient()) void getClient().then(listen);
  else void noticeEndedSession();
}

/** This device synced with an account and has no session for it any more: it asks to sign in again. */
async function noticeEndedSession(): Promise<void> {
  const state = await db.meta.get('sync');
  if (state) accountStore.setState({ endedSession: { email: state.email ?? null } });
}

/** After a session ended: removes the account's songs from this device instead of signing in again. */
export async function forgetEndedSession(): Promise<void> {
  await clearLibrary();
  accountStore.setState({ endedSession: null });
}

let listening = false;

function listen(supabase: SupabaseClient): void {
  if (listening) return;
  listening = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') accountStore.setState({ resettingPassword: true });
    // Supabase's own calls may not be awaited inside this callback, so the work runs after it.
    setTimeout(() => void signedInAs(session), 0);
  });
  window.addEventListener('online', () => scheduleSync(0));
  window.addEventListener('offline', () => accountStore.setState({ sync: 'offline' }));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleSync(0));
  // Changes made here are synced shortly after.
  for (const table of [db.songs, db.setlists] as const) {
    table.hook('creating', (_key, row) => void (row.dirty === 1 && scheduleSync()));
    table.hook('updating', (changes: { dirty?: number }, _key, row) => void ((changes.dirty ?? row.dirty) === 1 && scheduleSync()));
  }
  db.deletions.hook('creating', () => void scheduleSync());
}

async function signedInAs(session: Session | null): Promise<void> {
  const user = session?.user ?? null;
  const current = accountStore.getState();
  if (!user) {
    accountStore.setState({ status: 'guest', email: null, userId: null, guestLibrary: null });
    if (!leaving) await noticeEndedSession();
    return;
  }
  if (current.userId === user.id) return;
  accountStore.setState({ status: 'signedIn', email: user.email ?? null, userId: user.id, endedSession: null });

  const state = await db.meta.get('sync');
  if (state && state.userId === user.id) {
    if (user.email && state.email !== user.email) await db.meta.put({ ...state, email: user.email });
    scheduleSync(0);
    return;
  }
  // First sign-in on this device: what was made as a guest joins the account only if the user says so.
  const [songs, setlists] = await Promise.all([db.songs.count(), db.setlists.count()]);
  // Songs of another account (its session ended here) belong to that account: they can be removed, not added.
  const otherAccount = state ? { email: state.email ?? null } : undefined;
  if (songs + setlists > 0) accountStore.setState({ guestLibrary: { songs, setlists, otherAccount } });
  else await adoptLibrary(user.id);
}

/** The library from here on syncs with the account; what's in it now is uploaded at the next sync. */
async function adoptLibrary(userId: string): Promise<void> {
  const email = accountStore.getState().email ?? undefined;
  await db.meta.put({ key: 'sync', userId, email, lastPulled: null, held: [] });
  accountStore.setState({ guestLibrary: null });
  scheduleSync(0);
}

/** After signing in: add what was made as a guest to the account, or remove it from this device. */
export async function settleGuestLibrary(add: boolean): Promise<void> {
  const { userId, guestLibrary } = accountStore.getState();
  if (!userId) return;
  if (!add || guestLibrary?.otherAccount) await clearLibrary();
  await adoptLibrary(userId);
}

async function clearLibrary(): Promise<void> {
  await db.transaction('rw', [db.songs, db.setlists, db.deletions, db.conflicts, db.meta], async () => {
    await Promise.all([db.songs.clear(), db.setlists.clear(), db.deletions.clear(), db.conflicts.clear(), db.meta.clear()]);
  });
}

/** What went wrong signing in, in the app's words; null when it worked. */
export type AuthResult = { error: string } | { confirmEmail: true } | null;

function explain(error: AuthError | Error): string {
  const code = 'code' in error ? error.code : undefined;
  if (code === 'invalid_credentials') return 'Wrong email or password.';
  if (code === 'user_already_exists' || code === 'email_exists') return 'There’s already an account with this email. Sign in instead.';
  if (code === 'weak_password') return 'Choose a longer password: at least 8 characters.';
  if (code === 'email_not_confirmed') return 'Confirm your email first: open the link in the email we sent you.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Too many tries. Wait a minute and try again.';
  if (error.name === 'AuthRetryableFetchError' || error instanceof TypeError) return 'Couldn’t reach the server. Check your connection and try again.';
  return `Couldn’t sign in: ${error.message}`;
}

async function attempt(action: (supabase: SupabaseClient) => Promise<{ error: AuthError | null }>): Promise<AuthResult> {
  try {
    const supabase = await getClient();
    listen(supabase);
    const { error } = await action(supabase);
    return error ? { error: explain(error) } : null;
  } catch (error) {
    return { error: explain(error instanceof Error ? error : new Error(String(error))) };
  }
}

export const signIn = (email: string, password: string): Promise<AuthResult> =>
  attempt((supabase) => supabase.auth.signInWithPassword({ email, password }));

export async function signUp(email: string, password: string): Promise<AuthResult> {
  let confirm = false;
  const result = await attempt(async (supabase) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/account` } });
    // No session yet: the account is made once the email is confirmed.
    confirm = !error && data.session === null;
    return { error };
  });
  return result ?? (confirm ? { confirmEmail: true } : null);
}

export const sendPasswordReset = (email: string): Promise<AuthResult> =>
  attempt((supabase) => supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/account` }));

export async function setNewPassword(password: string): Promise<AuthResult> {
  const result = await attempt((supabase) => supabase.auth.updateUser({ password }));
  if (!result) accountStore.setState({ resettingPassword: false });
  return result;
}

/** Whether some changes here haven't reached the account yet (a last sync is tried first). */
export async function hasUnsyncedChanges(): Promise<boolean> {
  await runSync();
  const [songs, setlists, deletions] = await Promise.all([
    db.songs.where('dirty').equals(1).count(),
    db.setlists.where('dirty').equals(1).count(),
    db.deletions.count(),
  ]);
  return songs + setlists + deletions > 0;
}

// Set while this device signs out or deletes its account on purpose, so the session ending then isn't taken for
// one that ended on its own.
let leaving = false;

/** Ends the session on this device and removes the account's songs from it. */
async function leaveAccount(supabase: SupabaseClient, fromSync = false): Promise<void> {
  leaving = true;
  clearTimeout(timer);
  try {
    // Without Web Locks (plain http), at least this tab's sync finishes first, unless it's the one leaving.
    if (!navigator.locks && !fromSync) await running?.catch(() => undefined);
    // Under the sync lock, so no sync in any tab writes songs back while the library is emptied. The library
    // goes first: other tabs, told the session ended, then find no account's songs to ask about.
    const leave = async () => {
      await clearLibrary();
      // Signing out locally works offline too; the session simply ends here.
      await supabase.auth.signOut({ scope: 'local' });
    };
    await (navigator.locks ? navigator.locks.request(SYNC_LOCK, leave) : leave());
    accountStore.setState({
      status: 'guest', email: null, userId: null, sync: 'idle', lastSynced: null, guestLibrary: null, endedSession: null,
    });
  } finally {
    leaving = false;
  }
}

/**
 * Signed in while this device holds another account's songs: signs out again and keeps them, so the device
 * asks to sign in to that account again (or to remove them) as before.
 */
export async function keepOtherAccountsSongs(): Promise<void> {
  const supabase = await getClient();
  leaving = true;
  try {
    await supabase.auth.signOut({ scope: 'local' });
    accountStore.setState({ status: 'guest', email: null, userId: null, sync: 'idle', lastSynced: null, guestLibrary: null });
    await noticeEndedSession();
  } finally {
    leaving = false;
  }
}

/** Signs out and removes the account's songs from this device; they stay in the account. */
export async function signOut(): Promise<void> {
  await leaveAccount(await getClient());
}

/**
 * Deletes the account, with all its songs and setlists, and removes them from this device. Other devices
 * remove theirs when they next find the account gone (accountGone); one whose session can no longer be
 * renewed (away over an hour) can't ask, so it asks to sign in again and offers to remove them. Needs a
 * connection; nothing changes if it fails.
 */
export async function deleteAccount(): Promise<AuthResult> {
  if (!navigator.onLine) return { error: 'You’re offline. Connect to the internet to delete your account.' };
  let supabase: SupabaseClient;
  try {
    supabase = await getClient();
    const { error } = await supabase.rpc('delete_account');
    if (error) return { error: `Couldn’t delete your account: ${error.message}` };
  } catch (error) {
    return { error: explain(error instanceof Error ? error : new Error(String(error))) };
  }
  await leaveAccount(supabase);
  return null;
}

// How often a signed-in device asks whether its account still exists (it may have been deleted elsewhere).
const ACCOUNT_CHECK_MS = 10 * 60_000;
let lastAccountCheck = 0;

/**
 * Whether the server says this session's account no longer exists. Only that answer counts: an expired
 * session or an unreachable server is not a deleted account.
 */
async function accountGone(supabase: SupabaseClient): Promise<boolean> {
  lastAccountCheck = Date.now();
  try {
    const { error } = await supabase.auth.getUser();
    return error?.code === 'user_not_found';
  } catch {
    return false;
  }
}

/** The account was deleted on another device: this one removes its songs too, as deleting promises. */
async function accountDeletedElsewhere(supabase: SupabaseClient): Promise<void> {
  await leaveAccount(supabase, true);
  toast('info', 'Your account was deleted', 'It was deleted on another device, so its songs are removed from this one too.');
}

// ---- Syncing ----

let timer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<void> | null = null;
let again = false;
let failures = 0;

/** Syncs after `delay` ms (a moment after the last change, by default). */
export function scheduleSync(delay = SYNC_DELAY_MS): void {
  if (accountStore.getState().status !== 'signedIn') return;
  clearTimeout(timer);
  timer = setTimeout(() => void runSync(), delay);
}

/** Syncs now; while a sync runs, another one follows it instead of running beside it. */
export function runSync(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = syncOnce().finally(() => {
    running = null;
    if (again) {
      again = false;
      void runSync();
    }
  });
  return running;
}

async function syncOnce(): Promise<void> {
  const { userId, guestLibrary } = accountStore.getState();
  if (!userId || guestLibrary !== null) return; // signed out, or waiting for the guest library to be settled
  const state = await db.meta.get('sync');
  if (!state || state.userId !== userId) return;
  if (!navigator.onLine) {
    accountStore.setState({ sync: 'offline' });
    return;
  }
  accountStore.setState({ sync: 'syncing' });
  let supabase: SupabaseClient | null = null;
  try {
    supabase = await getClient();
    if (Date.now() - lastAccountCheck > ACCOUNT_CHECK_MS && (await accountGone(supabase))) {
      await accountDeletedElsewhere(supabase);
      return;
    }
    const remote = supabaseRemote(supabase);
    const work = async () => {
      // The library may have been emptied (signed out, account deleted) while this sync waited its turn.
      if ((await db.meta.get('sync'))?.userId !== userId) return;
      const open = await openSongIds();
      await sync(remote, userId, (id) => open.has(id) || openSongs.has(id));
    };
    // One tab syncs at a time; the others wait their turn.
    await (navigator.locks ? navigator.locks.request(SYNC_LOCK, work) : work());
    failures = 0;
    accountStore.setState({ sync: 'idle', lastSynced: Date.now() });
  } catch (error) {
    if (!navigator.onLine) {
      accountStore.setState({ sync: 'offline' }); // coming back online syncs again
      return;
    }
    // A sync that fails may be the first sign that the account is gone (its rows are, and new ones can't
    // be added to it).
    if (supabase && (await accountGone(supabase))) {
      await accountDeletedElsewhere(supabase);
      return;
    }
    accountStore.setState({ sync: error instanceof RemoteError && error.code === READ_ONLY ? 'unavailable' : 'failed' });
    scheduleSync(Math.min(RETRY_FIRST_MS * 2 ** failures, RETRY_LONGEST_MS));
    failures++;
  }
}
