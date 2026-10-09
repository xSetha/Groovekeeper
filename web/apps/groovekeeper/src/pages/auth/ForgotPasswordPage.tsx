import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { CheckBox, Field, FormMessage, INPUT, PRIMARY } from '../../components/forms';
import { useCheckedRequest, useTurnstile } from '../../components/Turnstile';
import { dismissLinkError, sendPasswordReset, type AuthResult } from '../../sync/account';
import { AuthLayout, GuestOnly } from './AuthLayout';

/**
 * /forgot-password, for someone who can't sign in: an email with a link that proves the address is theirs. The
 * link opens /forgot-password/new to choose a new password. (Signed in, Settings → Account changes it instead.)
 */
export default function ForgotPasswordPage() {
  return (
    <GuestOnly>
      <ForgotPassword />
    </GuestOnly>
  );
}

function ForgotPassword() {
  // The sign-in page passes the email typed there.
  const typed = (useLocation().state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(typed);
  const [result, setResult] = useState<AuthResult | 'sent'>(null);
  const check = useTurnstile();
  const { run, canSend } = useCheckedRequest(check);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    dismissLinkError();
    setResult(null);
    const outcome = await run(async (token) => (await sendPasswordReset(email, token)) ?? ('sent' as const));
    if (outcome !== undefined) setResult(outcome);
  };

  return (
    <AuthLayout title="Forgot password" intro="Type your account’s email and we’ll send you a link to choose a new password.">
      <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <Field label="Email">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </Field>
        {result === 'sent' ? (
          <FormMessage>If there’s an account for {email}, a link to choose a new password is on its way.</FormMessage>
        ) : result && 'error' in result ? (
          <FormMessage error>{result.error}</FormMessage>
        ) : null}
        <button type="submit" disabled={!canSend} className={PRIMARY}>
          Send the link
        </button>
        <CheckBox check={check} />
      </form>
      <p className="mt-4 text-sm">
        <Link to="/signin" className="text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
