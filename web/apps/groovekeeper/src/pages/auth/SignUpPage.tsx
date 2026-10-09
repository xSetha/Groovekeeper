import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { CheckBox, Field, FormMessage, INPUT, PASSWORDS_DIFFER, PRIMARY, TextButton } from '../../components/forms';
import { useCheckedRequest, useTurnstile } from '../../components/Turnstile';
import { dismissLinkError, resendConfirmation, signUp, type AuthResult } from '../../sync/account';
import { AuthLayout, GuestOnly } from './AuthLayout';

/** /signup: email and a password twice; then "Check your email", as the account is made once it's confirmed. */
export default function SignUpPage() {
  return (
    <GuestOnly>
      <SignUp />
    </GuestOnly>
  );
}

function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [result, setResult] = useState<AuthResult | 'confirmationSent'>(null);
  // The account just made, waiting for its email to be confirmed.
  const [confirming, setConfirming] = useState(false);
  const check = useTurnstile();
  const { run, canSend } = useCheckedRequest(check);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setResult(null);
    if (confirmation !== password) {
      setResult({ error: PASSWORDS_DIFFER });
      return;
    }
    dismissLinkError();
    const outcome = await run((token) => signUp(email, password, token));
    if (outcome === undefined) return;
    if (outcome !== null && 'confirmEmail' in outcome) setConfirming(true);
    else setResult(outcome);
  };

  const sendAgain = async () => {
    setResult(null);
    const outcome = await run(async (token) => (await resendConfirmation(email, token)) ?? ('confirmationSent' as const));
    if (outcome !== undefined) setResult(outcome);
  };

  const message =
    result === 'confirmationSent' ? (
      <FormMessage>A new link is on its way to {email}.</FormMessage>
    ) : result && 'error' in result ? (
      <FormMessage error>{result.error}</FormMessage>
    ) : null;

  // The check stays in one place below, whichever of the two views shows, so its token isn't lost.
  return (
    <AuthLayout
      title={confirming ? 'Check your email' : 'Create an account'}
      intro={
        confirming ? undefined : 'Your songs and setlists are kept in the account and on every device you sign in on.'
      }
    >
      {confirming ? (
        <div className="mt-3 flex flex-col gap-3">
          <p>
            We sent a link to <strong>{email}</strong>. Open it to confirm your account; it signs you in.
          </p>
          <p className="text-muted">Already have an account with this email? Then no email comes: sign in, or use Forgot password.</p>
          {message}
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <TextButton onClick={() => void sendAgain()} disabled={!canSend}>
              Send the email again
            </TextButton>
            <Link to="/signin" className="text-accent hover:underline pointer-coarse:min-h-11">
              Sign in
            </Link>
          </div>
        </div>
      ) : (
        <>
          <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
            <Field label="Email">
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
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
            {message}
            <button type="submit" disabled={!canSend} className={PRIMARY}>
              Create account
            </button>
          </form>
          <p className="mt-4 text-sm text-muted">
            What an account keeps about you, and where: the{' '}
            <Link to="/privacy" className="text-accent hover:underline">
              privacy page
            </Link>
            . Already have an account?{' '}
            <Link to="/signin" className="text-accent hover:underline">
              Sign in
            </Link>
            .
          </p>
        </>
      )}
      <div className="mt-4">
        <CheckBox check={check} />
      </div>
    </AuthLayout>
  );
}
