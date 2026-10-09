import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field, FormMessage, INPUT, PRIMARY, SECONDARY, TextButton } from '../../components/forms';
import { useSignOut } from '../../components/useSignOut';
import { changeEmail, hasUnsyncedChanges, signOutEverywhere, useAccount, type AuthResult } from '../../sync/account';
import { toast } from '../../toasts';
import { Group, SectionTitle } from './parts';

/** Settings → Account: the email, the password, and signing out (here, or on every device). */
export function AccountSection() {
  return (
    <>
      <SectionTitle>Account</SectionTitle>
      <EmailGroup />
      <Group title="Password" description="Change the password you sign in with. You need your current one.">
        <Link to="/settings/account/password" className={`inline-block ${SECONDARY}`}>
          Change password
        </Link>
      </Group>
      <SignOutGroup />
    </>
  );
}

function EmailGroup() {
  const email = useAccount((s) => s.email);
  const newEmail = useAccount((s) => s.newEmail);
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState('');
  const [result, setResult] = useState<AuthResult>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (next.trim().toLowerCase() === email?.toLowerCase()) {
      setResult({ error: 'That’s the address you have. Type the new one.' });
      return;
    }
    setBusy(true);
    const outcome = await changeEmail(next.trim());
    setBusy(false);
    setResult(outcome);
    if (!outcome) setEditing(false);
  };

  return (
    <Group title="Email" description="You sign in with it, and the account’s emails go to it.">
      <p>
        <strong>{email}</strong>
      </p>
      {newEmail ? (
        <p role="status" className="mt-2 text-sm">
          Changing to <strong>{newEmail}</strong>: we sent a link to both addresses. The change is made once both are opened.
        </p>
      ) : null}
      {editing ? (
        <form className="mt-4 flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
          <Field label="New email">
            <input type="email" required autoComplete="email" value={next} onChange={(e) => setNext(e.target.value)} className={INPUT} />
          </Field>
          {result && 'error' in result ? <FormMessage error>{result.error}</FormMessage> : null}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={busy} className={PRIMARY}>
              Change email
            </button>
            <TextButton
              onClick={() => {
                setEditing(false);
                setResult(null);
              }}
            >
              Cancel
            </TextButton>
          </div>
        </form>
      ) : (
        <button type="button" className={`mt-3 ${SECONDARY}`} onClick={() => setEditing(true)}>
          Change email
        </button>
      )}
    </Group>
  );
}

function SignOutGroup() {
  const { signOut, busy, dialog } = useSignOut();
  const navigate = useNavigate();
  // null: not asked; otherwise whether changes on this device haven't reached the account (they'd be lost).
  const [askingEverywhere, setAskingEverywhere] = useState<{ unsynced: boolean } | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setWorking(true);
    setError(null);
    // A last sync first, as signing out does; what still hasn't reached the account is said in the question.
    const unsynced = await hasUnsyncedChanges();
    setWorking(false);
    setAskingEverywhere({ unsynced });
  };
  const everywhere = async () => {
    setAskingEverywhere(null);
    setWorking(true);
    const result = await signOutEverywhere();
    setWorking(false);
    if (result && 'error' in result) {
      setError(result.error);
      return;
    }
    toast('success', 'Signed out everywhere', 'Every device needs to sign in again.');
    // Replacing /signin, where the settings page sent the user once signed out, so Back doesn't return to it.
    navigate('/', { replace: true });
  };

  return (
    <Group
      title="Signing out"
      description="Signing out removes your songs from this device; they stay in your account. Sign out everywhere if you used a device that isn’t yours."
    >
      {error ? <FormMessage error>{error}</FormMessage> : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={busy || working} className={SECONDARY} onClick={signOut}>
          Sign out
        </button>
        <button type="button" disabled={busy || working} className={SECONDARY} onClick={() => void ask()}>
          Sign out everywhere
        </button>
      </div>
      {dialog}
      {askingEverywhere ? (
        <ConfirmDialog
          title="Sign out on every device?"
          message={`This device signs out and removes your songs from it, as signing out does. Your other devices ask to sign in again and keep their songs until then.${askingEverywhere.unsynced ? ' Changes made on this device since the last sync haven’t reached your account: they’re lost.' : ''}`}
          confirmLabel="Sign out everywhere"
          onCancel={() => setAskingEverywhere(null)}
          onConfirm={() => void everywhere()}
        />
      ) : null}
    </Group>
  );
}
