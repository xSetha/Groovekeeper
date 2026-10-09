import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { CheckBox, Field, FormMessage, INPUT, PASSWORDS_DIFFER, PRIMARY } from '../../components/forms';
import { useCheckedRequest, useTurnstile } from '../../components/Turnstile';
import { changePassword } from '../../sync/account';
import { toast } from '../../toasts';
import { SectionTitle } from './parts';

/**
 * Settings → Account → Change password: the current password, then the new one twice. Saved at once, no email.
 * (Someone who forgot it uses Forgot password on the sign-in page instead.)
 */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Checking the current password is a sign-in, so it carries a token from the check against bots.
  const check = useTurnstile();
  const { run, canSend } = useCheckedRequest(check);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (confirmation !== next) {
      setError(PASSWORDS_DIFFER);
      return;
    }
    if (next === current) {
      setError('The new password is the one you have. Choose another.');
      return;
    }
    const result = await run((token) => changePassword(current, next, token));
    if (result === undefined) return;
    if (result && 'error' in result) {
      setError(result.error);
      return;
    }
    toast('success', 'Password changed', 'Sign in with the new password from now on.');
    navigate('/settings/account');
  };

  return (
    <>
      <SectionTitle>Change password</SectionTitle>
      <form className="mt-6 flex max-w-md flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <Field label="Current password">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
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
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={!canSend} className={PRIMARY}>
            Save password
          </button>
          <Link to="/settings/account" className="text-accent hover:underline">
            Cancel
          </Link>
        </div>
        <CheckBox check={check} />
      </form>
      <p className="mt-6 text-sm text-muted">
        Forgot your current password? Sign out and use Forgot password on the sign-in page.
      </p>
    </>
  );
}
