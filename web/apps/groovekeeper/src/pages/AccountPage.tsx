import { cloneElement, useEffect, useId, useState, type FormEvent, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  hasUnsyncedChanges, runSync, sendPasswordReset, setNewPassword, settleGuestLibrary, signIn, signOut, signUp, useAccount,
  type AuthResult,
} from '../sync/account';

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
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuthResult | 'resetSent'>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (mode === 'create' && confirmation !== password) {
      setResult({ error: PASSWORDS_DIFFER });
      return;
    }
    setBusy(true);
    setResult(null);
    if (mode === 'reset') {
      const sent = await sendPasswordReset(email);
      setResult(sent ?? 'resetSent');
    } else {
      setResult(await (mode === 'signIn' ? signIn(email, password) : signUp(email, password)));
    }
    setBusy(false);
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setConfirmation('');
    setResult(null);
  };

  if (result !== null && result !== 'resetSent' && 'confirmEmail' in result) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="mt-3">
          We sent a link to <strong>{email}</strong>. Open it to confirm your account, then sign in here.
        </p>
        <TextButton onClick={() => switchTo('signIn')}>Back to sign in</TextButton>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">{mode === 'signIn' ? 'Sign in' : mode === 'create' ? 'Create an account' : 'Reset your password'}</h1>
      <p className="mt-2 text-muted">
        {mode === 'reset'
          ? 'Type your account’s email and we’ll send you a link to choose a new password.'
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
        {result === 'resetSent' ? (
          <p role="status">If there’s an account for {email}, a link to choose a new password is on its way.</p>
        ) : result && 'error' in result ? (
          <p role="alert" className="text-chord">{result.error}</p>
        ) : null}
        <button type="submit" disabled={busy} className={PRIMARY}>
          {mode === 'signIn' ? 'Sign in' : mode === 'create' ? 'Create account' : 'Send reset link'}
        </button>
      </form>
      <div className="mt-4 flex flex-wrap gap-x-4 text-sm">
        {mode === 'signIn' ? (
          <>
            <TextButton onClick={() => switchTo('create')}>Create an account</TextButton>
            <TextButton onClick={() => switchTo('reset')}>Forgot password?</TextButton>
          </>
        ) : (
          <TextButton onClick={() => switchTo('signIn')}>I have an account: sign in</TextButton>
        )}
      </div>
    </>
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
    </>
  );
}

/** Just signed in, with songs or setlists made here as a guest: add them to the account, or remove them here. */
function GuestLibrary({ songs, setlists }: { songs: number; setlists: number }) {
  const [busy, setBusy] = useState(false);
  const settle = (add: boolean) => {
    setBusy(true);
    void settleGuestLibrary(add).finally(() => setBusy(false));
  };
  const count = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);
  // Only what's there: "6 songs and 2 setlists", "6 songs" or "2 setlists".
  const what = [songs > 0 ? count(songs, 'song') : null, setlists > 0 ? count(setlists, 'setlist') : null].filter(Boolean).join(' and ');
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
  const [busy, setBusy] = useState(false);

  const leave = async () => {
    await signOut();
    navigate('/');
  };
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
              : lastSynced
                ? `Synced at ${new Date(lastSynced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
                : 'Not synced yet.'}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={sync === 'syncing'} className={SECONDARY} onClick={() => void runSync()}>
          Sync now
        </button>
        <button type="button" disabled={busy} className={SECONDARY} onClick={() => void askToSignOut()}>
          Sign out
        </button>
      </div>
      <p className="mt-3 text-sm text-muted">Signing out removes your songs from this device. They stay in your account.</p>
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

function TextButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" className="mt-3 text-accent hover:underline pointer-coarse:min-h-11" onClick={onClick}>
      {children}
    </button>
  );
}
