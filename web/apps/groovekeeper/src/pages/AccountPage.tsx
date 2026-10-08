import { useLiveQuery } from 'dexie-react-hooks';
import { cloneElement, useEffect, useId, useState, type FormEvent, type ReactElement } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExportLibrary, saveLibraryExport } from '../components/ExportLibrary';
import { CHECK_PROBLEMS, useTurnstile } from '../components/Turnstile';
import { db, type Refusal, type Synced } from '../library/db';
import { LIMITS } from '../library/limits';
import {
  deleteAccount, dismissLinkError, forgetEndedSession, keepPassword, hasUnsyncedChanges, keepOtherAccountsSongs, runSync, sendPasswordReset, setNewPassword,
  resendConfirmation, settleGuestLibrary, signIn, signOut, signUp, useAccount,
  type AuthResult, type GuestLibrary as GuestLibraryState,
} from '../sync/account';
import { toast } from '../toasts';

/** Signing in or creating an account; once signed in, the account, its sync, and Sign out. */
export default function AccountPage() {
  const status = useAccount((s) => s.status);
  const resetting = useAccount((s) => s.resettingPassword);
  const guestLibrary = useAccount((s) => s.guestLibrary);

  useEffect(() => {
    document.title = 'Account – Groovekeeper';
  }, []);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-md px-4 py-8">
        <LinkErrorBanner />
        {status === 'starting' ? null : resetting ? (
          <NewPassword />
        ) : status === 'guest' ? (
          <SignInForms />
        ) : guestLibrary !== null ? (
          <GuestLibrary {...guestLibrary} />
        ) : (
          <SignedIn />
        )}
      </div>
    </main>
  );
}

type Mode = 'signIn' | 'create' | 'reset';

const PASSWORDS_DIFFER = 'The passwords don’t match. Type the same password in both boxes.';

function SignInForms() {
  // Opened from the guest note's "Create an account": that form first.
  const create = (useLocation().state as { create?: boolean } | null)?.create === true;
  const [mode, setMode] = useState<Mode>(create ? 'create' : 'signIn');
  // The session of the account this device synced with ended: sign in to it again, or remove its songs.
  const ended = useAccount((s) => s.endedSession);
  const linkError = useAccount((s) => s.linkError);
  const [forgetting, setForgetting] = useState(false);
  const [email, setEmail] = useState(ended?.email ?? '');
  // The ended session is known only once the library has been read; its email then fills an empty field.
  const endedEmail = ended?.email;
  useEffect(() => {
    if (endedEmail) setEmail((typed) => typed || endedEmail);
  }, [endedEmail]);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuthResult | 'resetSent' | 'confirmationSent'>(null);
  // The account just made, waiting for its email to be confirmed.
  const [confirming, setConfirming] = useState(false);
  const check = useTurnstile();

  /** Runs one request with this form's token; a token works once, so a new one is fetched after. */
  const withCheck = async (request: (token: string) => Promise<AuthResult | 'resetSent' | 'confirmationSent'>) => {
    if (!check.token) return;
    setBusy(true);
    setResult(null);
    const outcome = await request(check.token);
    check.renew();
    if (outcome !== null && typeof outcome === 'object' && 'confirmEmail' in outcome) setConfirming(true);
    else setResult(outcome);
    setBusy(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'create' && confirmation !== password) {
      setResult({ error: PASSWORDS_DIFFER });
      return;
    }
    dismissLinkError();
    await withCheck(async (token) => {
      if (mode === 'reset') return (await sendPasswordReset(email, token)) ?? 'resetSent';
      return mode === 'signIn' ? signIn(email, password, token) : signUp(email, password, token);
    });
  };

  const sendConfirmationAgain = () => {
    if (!email) {
      setResult({ error: 'Type your email first.' });
      return;
    }
    dismissLinkError();
    void withCheck(async (token) => (await resendConfirmation(email, token)) ?? 'confirmationSent');
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setConfirmation('');
    setResult(null);
    setConfirming(false);
  };

  const canSend = check.token !== null && !busy;
  const sent =
    result === 'resetSent' ? (
      <p role="status">If there’s an account for {email}, a link to choose a new password is on its way.</p>
    ) : result === 'confirmationSent' ? (
      <p role="status">
        If {email} has an account waiting to be confirmed, a new link is on its way. If it’s confirmed already, sign
        in, or reset your password.
      </p>
    ) : result && 'error' in result ? (
      <p role="alert" className="text-chord">
        {result.error}
      </p>
    ) : null;

  return (
    <>
      {confirming ? (
        <>
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p className="mt-3">
            We sent a link to <strong>{email}</strong>. Open it to confirm your account, then sign in here.
          </p>
          <p className="mt-3 text-muted">
            Already have an account with this email? Then no email comes: sign in, or reset your password.
          </p>
          <div className="mt-3">{sent}</div>
          <div className="mt-2 flex flex-wrap gap-x-4 text-sm">
            <TextButton onClick={sendConfirmationAgain} disabled={!canSend}>
              Send the email again
            </TextButton>
            <TextButton onClick={() => switchTo('signIn')}>Back to sign in</TextButton>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">
            {mode === 'signIn' ? (ended ? 'Sign in again' : 'Sign in') : mode === 'create' ? 'Create an account' : 'Reset your password'}
          </h1>
          <p className="mt-2 text-muted">
            {mode === 'reset'
              ? 'Type your account’s email and we’ll send you a link to choose a new password.'
              : ended
                ? `Your session on this device ended (signed out on all devices, or the account was deleted), so the songs here aren’t syncing. Sign in${ended.email ? ` as ${ended.email}` : ''} to keep syncing them.`
                : 'With an account, your songs and setlists are kept in it and on every device you sign in on. Without one, they stay in this browser.'}
          </p>
          <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
            <Field label="Email">
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
            </Field>
            {mode === 'reset' ? null : (
              <Field label="Password" hint={mode === 'create' ? 'At least 8 characters.' : undefined}>
                <input
                  type="password"
                  required
                  minLength={mode === 'create' ? 8 : undefined}
                  autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={INPUT}
                />
              </Field>
            )}
            {mode === 'create' ? (
              <Field label="Confirm password">
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className={INPUT}
                />
              </Field>
            ) : null}
            {sent}
            <button type="submit" disabled={!canSend} className={PRIMARY}>
              {mode === 'signIn' ? 'Sign in' : mode === 'create' ? 'Create account' : 'Send reset link'}
            </button>
          </form>
          <p className="mt-3 text-sm text-muted">
            What an account keeps about you, and where: the{' '}
            <Link to="/privacy" className="text-accent hover:underline">
              privacy page
            </Link>
            .
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 text-sm">
            {mode === 'signIn' ? (
              <>
                <TextButton onClick={() => switchTo('create')}>Create an account</TextButton>
                <TextButton onClick={() => switchTo('reset')}>Forgot password?</TextButton>
              </>
            ) : (
              <TextButton onClick={() => switchTo('signIn')}>I have an account: sign in</TextButton>
            )}
            {linkError || (result && typeof result === 'object' && 'code' in result && result.code === 'email_not_confirmed') ? (
              <TextButton onClick={sendConfirmationAgain} disabled={!canSend}>
                Send the confirmation email again
              </TextButton>
            ) : null}
          </div>
          {ended ? (
            <>
              <p className="mt-8 text-sm text-muted">Not signing in again? The songs on this device can go instead.</p>
              <TextButton onClick={() => setForgetting(true)}>Remove these songs from this device</TextButton>
            </>
          ) : null}
        </>
      )}
      {/* The check against bots: shown only when it needs the user (managed mode); kept in one place across forms. */}
      <div ref={check.box} className="mt-4" />
      {check.problem ? (
        <p role="alert" className="mt-2 text-sm text-chord">
          {CHECK_PROBLEMS[check.problem]}
        </p>
      ) : check.token === null ? (
        <p role="status" className="mt-2 text-sm text-muted">
          {check.waitingForUser ? 'Tick the box above to show you’re not a bot.' : 'Checking that you’re not a bot…'}
        </p>
      ) : null}
      {forgetting ? (
        <ConfirmDialog
          title="Remove these songs from this device?"
          message="If the account still exists, its songs stay in it. Changes made on this device since it last synced are lost."
          confirmLabel="Remove them"
          onCancel={() => setForgetting(false)}
          onConfirm={() => {
            setForgetting(false);
            void forgetEndedSession().then(() => toast('success', 'Removed the songs from this device'));
          }}
        />
      ) : null}
    </>
  );
}

/** An email link that didn't work: why, and how to get a new one. It stays until it's closed or a new link is asked for. */
function LinkErrorBanner() {
  const linkError = useAccount((s) => s.linkError);
  const signedIn = useAccount((s) => s.status === 'signedIn');
  if (!linkError) return null;
  return (
    <div role="alert" className="mb-6 flex items-start gap-2 rounded border border-chord px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {linkError.expired ? 'That email link has expired or was already used' : 'That email link didn’t work'}
        </p>
        <p className="mt-1 text-sm text-muted">
          A link works once, for an hour (some email apps open links to check them, which uses them up).{' '}
          {signedIn
            ? 'You’re signed in already, so nothing is needed here.'
            : 'Type your email below to get a new one: send the confirmation again, or reset your password.'}
        </p>
      </div>
      <button
        type="button"
        aria-label="Close"
        className="-my-1 -mr-2 rounded px-2 py-1 text-muted hover:bg-hover hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        onClick={dismissLinkError}
      >
        ×
      </button>
    </div>
  );
}

/** Opened from a reset link: the new password. */
function NewPassword() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (confirmation !== password) {
      setError(PASSWORDS_DIFFER);
      return;
    }
    setBusy(true);
    const result = await setNewPassword(password);
    setError(result && 'error' in result ? result.error : null);
    setBusy(false);
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <Field label="New password" hint="At least 8 characters.">
          <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Confirm new password">
          <input type="password" required autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={INPUT} />
        </Field>
        {error ? <p role="alert" className="text-chord">{error}</p> : null}
        <button type="submit" disabled={busy} className={PRIMARY}>
          Save password
        </button>
      </form>
      <TextButton onClick={keepPassword}>Keep my password</TextButton>
    </>
  );
}

/** Songs and setlists on this device that the account refused: why, and what to do about it. */
function NotInAccount() {
  const refused = useLiveQuery(async () => {
    const [songs, setlists] = await Promise.all([db.songs.toArray(), db.setlists.toArray()]);
    const count = (rows: Synced[], reason: Refusal['reason']) => rows.filter((row) => row.refused?.reason === reason).length;
    return { songs: count(songs, 'limit'), setlists: count(setlists, 'limit'), long: count(songs, 'size') + count(setlists, 'size') };
  }, []);
  if (!refused) return null;
  const many = (n: number, one: string) => (n === 1 ? `1 ${one} isn’t` : `${n} ${one}s aren’t`);
  return (
    <>
      {refused.songs > 0 ? (
        <p className="mt-2 text-chord">
          {many(refused.songs, 'song')} in your account: it holds up to {LIMITS.songs} songs. They’re marked in the library;
          delete songs you don’t need and they’re added.
        </p>
      ) : null}
      {refused.setlists > 0 ? (
        <p className="mt-2 text-chord">
          {many(refused.setlists, 'setlist')} in your account: it holds up to {LIMITS.setlists} setlists. Delete setlists you
          don’t need and they’re added.
        </p>
      ) : null}
      {refused.long > 0 ? (
        <p className="mt-2 text-chord">
          {refused.long === 1 ? '1 song or setlist is' : `${refused.long} songs or setlists are`} too long for your account. Shorten
          {refused.long === 1 ? ' it' : ' them'} and {refused.long === 1 ? 'it’s' : 'they’re'} added.
        </p>
      ) : null}
    </>
  );
}

/** Just signed in, with songs or setlists made here as a guest: add them to the account, or remove them here. */
function GuestLibrary({ songs, setlists, otherAccount }: GuestLibraryState) {
  const [busy, setBusy] = useState(false);
  const settle = (add: boolean) => {
    setBusy(true);
    void settleGuestLibrary(add).finally(() => setBusy(false));
  };
  const count = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);
  // Only what's there: "6 songs and 2 setlists", "6 songs" or "2 setlists".
  const what = [songs > 0 ? count(songs, 'song') : null, setlists > 0 ? count(setlists, 'setlist') : null].filter(Boolean).join(' and ');
  if (otherAccount) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Remove another account’s songs?</h1>
        <p className="mt-3">
          This browser has {what} of {otherAccount.email ?? 'another account'}, which was signed in here before. They
          stay in that account, if it still exists; changes made here that never synced are lost. Remove{' '}
          {songs + setlists === 1 ? 'it' : 'them'} from this device to use your account here.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" disabled={busy} className={PRIMARY} onClick={() => settle(false)}>
            Remove {songs + setlists === 1 ? 'it' : 'them'} from this device
          </button>
          <button
            type="button"
            disabled={busy}
            className={SECONDARY}
            onClick={() => {
              setBusy(true);
              void keepOtherAccountsSongs().finally(() => setBusy(false));
            }}
          >
            Keep them and sign out
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-semibold">Add what’s on this device?</h1>
      <p className="mt-3">
        This browser has {what}, made before you signed in. Add {songs + setlists === 1 ? 'it' : 'them'} to your
        account to keep {songs + setlists === 1 ? 'it' : 'them'}, or remove {songs + setlists === 1 ? 'it' : 'them'} from
        this device to start from what’s in your account.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={busy} className={PRIMARY} onClick={() => settle(true)}>
          Add {what} to my account
        </button>
        <button type="button" disabled={busy} className={SECONDARY} onClick={() => settle(false)}>
          Remove {songs + setlists === 1 ? 'it' : 'them'} from this device
        </button>
      </div>
    </>
  );
}

function SignedIn() {
  const navigate = useNavigate();
  const email = useAccount((s) => s.email);
  const sync = useAccount((s) => s.sync);
  const lastSynced = useAccount((s) => s.lastSynced);
  const [confirm, setConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const counts = useLiveQuery(() => Promise.all([db.songs.count(), db.setlists.count()]), []);

  const leave = async () => {
    await signOut();
    navigate('/');
  };
  const deleteForGood = async () => {
    setConfirmDelete(false);
    setBusy(true);
    const result = await deleteAccount();
    setBusy(false);
    if (result && 'error' in result) {
      setDeleteError(result.error);
      return;
    }
    toast('success', 'Your account is deleted', 'Its songs and setlists are gone, from this device too.');
    navigate('/');
  };
  const [songs = 0, setlists = 0] = counts ?? [];
  const many = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);
  const askToSignOut = async () => {
    setBusy(true);
    if (await hasUnsyncedChanges()) setConfirm(true);
    else await leave();
    setBusy(false);
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">Account</h1>
      <p className="mt-3">
        Signed in as <strong>{email}</strong>
      </p>
      <p className="mt-2 text-muted" role="status">
        {sync === 'syncing'
          ? 'Syncing…'
          : sync === 'offline'
            ? 'Offline. Changes are saved on this device and sync when you’re back online.'
            : sync === 'failed'
              ? 'Couldn’t sync. It tries again by itself in a moment, or sync now.'
              : sync === 'unavailable'
                ? 'The account can’t take changes right now. Your changes are saved on this device and sync once it can.'
              : lastSynced
                ? `Synced at ${new Date(lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
                : 'Not synced yet.'}
      </p>
      <NotInAccount />
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={sync === 'syncing'} className={SECONDARY} onClick={() => void runSync()}>
          Sync now
        </button>
        <ExportLibrary className={SECONDARY} />
        <button type="button" disabled={busy} className={SECONDARY} onClick={() => void askToSignOut()}>
          Sign out
        </button>
      </div>
      <p className="mt-3 text-sm text-muted">Signing out removes your songs from this device. They stay in your account.</p>
      <p className="mt-3 text-sm text-muted">
        What’s kept about you, and where: the{' '}
        <Link to="/privacy" className="text-accent hover:underline">
          privacy page
        </Link>
        .
      </p>
      <h2 className="mt-10 font-semibold">Delete your account</h2>
      <p className="mt-2 text-sm text-muted">
        Deletes the account and everything in it for good, and removes its songs from this device.
      </p>
      {deleteError ? (
        <p role="alert" className="mt-2 text-sm text-chord">
          {deleteError}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        className="mt-3 rounded border border-chord px-4 py-2 text-sm font-semibold text-chord hover:bg-hover pointer-coarse:min-h-11"
        onClick={() => {
          setDeleteError(null);
          setConfirmDelete(true);
        }}
      >
        Delete account
      </button>
      {confirmDelete ? (
        <ConfirmDialog
          title="Delete your account for good?"
          message={`The account is deleted with its ${[many(songs, 'song'), ...(setlists > 0 ? [many(setlists, 'setlist')] : [])].join(' and ')}, and they’re removed from this device. Your other devices remove them when they next connect, or ask you to sign in again and offer to remove them. Export the library first to keep a copy.`}
          confirmLabel="Delete account"
          extra={{ label: 'Export library first', onClick: () => void saveLibraryExport() }}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void deleteForGood()}
        />
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title="Some changes haven’t synced"
          message="Changes made on this device since the last sync haven’t reached your account. If you sign out now, they’re lost."
          confirmLabel="Sign out anyway"
          onCancel={() => setConfirm(false)}
          onConfirm={() => void leave()}
        />
      ) : null}
    </>
  );
}

const INPUT =
  'rounded border border-line bg-window px-2 py-2 text-base placeholder:text-hint focus:border-accent focus:outline-none pointer-coarse:min-h-11';
const PRIMARY =
  'self-start rounded bg-accent-fill px-5 py-2.5 font-semibold text-on-accent hover:brightness-125 disabled:opacity-40 pointer-coarse:min-h-11';
const SECONDARY = 'rounded border border-line px-4 py-2 hover:bg-hover disabled:opacity-40 pointer-coarse:min-h-11';

/** A labelled field; the hint under it is read out as the field's description. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactElement<{ 'aria-describedby'?: string }> }) {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">{label}</span>
        {hint ? cloneElement(children, { 'aria-describedby': hintId }) : children}
      </label>
      {hint ? <span id={hintId} className="text-sm text-muted">{hint}</span> : null}
    </div>
  );
}

function TextButton({ onClick, children, disabled }: { onClick: () => void; children: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="mt-3 text-accent hover:underline disabled:opacity-50 pointer-coarse:min-h-11"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
