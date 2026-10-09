import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Field, FormMessage, INPUT, PASSWORDS_DIFFER, PRIMARY } from '../../components/forms';
import { accountStore, setNewPassword, useAccount } from '../../sync/account';
import { toast } from '../../toasts';
import { AuthLayout, useAfterSignIn } from './AuthLayout';

/**
 * /forgot-password/new, opened from the forgot-password email (which signs the user in): a new password, twice.
 * Leaving the page keeps the old password; the user stays signed in, and can come back to it until they reload.
 */
export default function NewPasswordPage() {
  const status = useAccount((s) => s.status);
  // Whether the page was opened from the link, as it was when it opened: saving clears it, and the page then
  // goes on by itself rather than being sent elsewhere.
  const [resetting] = useState(() => accountStore.getState().resettingPassword);
  const next = useAfterSignIn();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'starting') return null;
  // Opened without a link from the email: signed in, the password is changed in Settings; otherwise sign in.
  if (!resetting) return <Navigate to={status === 'signedIn' ? '/settings/account/password' : '/forgot-password'} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (confirmation !== password) {
      setError(PASSWORDS_DIFFER);
      return;
    }
    setBusy(true);
    const result = await setNewPassword(password);
    setBusy(false);
    if (result && 'error' in result) {
      setError(result.error);
      return;
    }
    toast('success', 'Password changed', 'You’re signed in with your new password.');
    navigate(next, { replace: true });
  };

  return (
    <AuthLayout title="Choose a new password" intro="The link signed you in. Choose a new password to sign in with from now on.">
      <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <Field label="New password" hint="At least 8 characters.">
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className={INPUT}
          />
        </Field>
        {error ? <FormMessage error>{error}</FormMessage> : null}
        <button type="submit" disabled={busy} className={PRIMARY}>
          Save password
        </button>
      </form>
    </AuthLayout>
  );
}
