import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CheckBox, Field, FormMessage, INPUT, PRIMARY, TextButton } from '../../components/forms';
import { useCheckedRequest, useTurnstile } from '../../components/Turnstile';
import { dismissLinkError, forgetEndedSession, resendConfirmation, signIn, useAccount, type AuthResult } from '../../sync/account';
import { toast } from '../../toasts';
import { AuthLayout, GuestOnly } from './AuthLayout';

/** /signin: email and password. Once signed in, the guard moves on (to the songs question, or home). */
export default function SignInPage() {
  return (
    <GuestOnly>
      <SignIn />
    </GuestOnly>
  );
}

function SignIn() {
  // The session of the account this device synced with ended: sign in to it again, or remove its songs.
  const ended = useAccount((s) => s.endedSession);
  const linkError = useAccount((s) => s.linkError);
  const [email, setEmail] = useState(ended?.email ?? '');
  // The ended session is known only once the library has been read; its email then fills an empty field.
  const endedEmail = ended?.email;
  useEffect(() => {
    if (endedEmail) setEmail((typed) => typed || endedEmail);
  }, [endedEmail]);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<AuthResult | 'confirmationSent'>(null);
  const [forgetting, setForgetting] = useState(false);
  const check = useTurnstile();
  const { run, canSend } = useCheckedRequest(check);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    dismissLinkError();
    setResult(null);
    const outcome = await run((token) => signIn(email, password, token));
    if (outcome !== undefined) setResult(outcome);
  };

  const sendConfirmationAgain = async () => {
    if (!email) {
      setResult({ error: 'Type your email first.' });
      return;
    }
    dismissLinkError();
    setResult(null);
    const outcome = await run(async (token) => (await resendConfirmation(email, token)) ?? ('confirmationSent' as const));
    if (outcome !== undefined) setResult(outcome);
  };

  const notConfirmed = result !== null && typeof result === 'object' && 'code' in result && result.code === 'email_not_confirmed';
  const intro = ended
    ? `Your session on this device ended (signed out on all devices, or the account was deleted), so the songs here aren’t syncing. Sign in${ended.email ? ` as ${ended.email}` : ''} to keep syncing them.`
    : 'With an account, your songs and setlists are kept in it and on every device you sign in on. Without one, they stay in this browser.';

  return (
    <AuthLayout title="Sign in" intro={intro}>
      <form className="mt-6 flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
        <Field label="Email">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT}
          />
        </Field>
        {result === 'confirmationSent' ? (
          <FormMessage>
            If {email} has an account waiting to be confirmed, a new link is on its way. If it’s confirmed already, sign in,
            or use Forgot password.
          </FormMessage>
        ) : result && 'error' in result ? (
          <FormMessage error>{result.error}</FormMessage>
        ) : null}
        <button type="submit" disabled={!canSend} className={PRIMARY}>
          Sign in
        </button>
        <CheckBox check={check} />
      </form>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link to="/signup" className="text-accent hover:underline pointer-coarse:min-h-11">
          Create an account
        </Link>
        <Link to="/forgot-password" state={{ email }} className="text-accent hover:underline pointer-coarse:min-h-11">
          Forgot password?
        </Link>
        {linkError || notConfirmed ? (
          <TextButton onClick={() => void sendConfirmationAgain()} disabled={!canSend}>
            Send the confirmation email again
          </TextButton>
        ) : null}
      </div>
      <p className="mt-6 text-sm text-muted">
        What an account keeps about you, and where: the{' '}
        <Link to="/privacy" className="text-accent hover:underline">
          privacy page
        </Link>
        .
      </p>
      {ended ? (
        <div className="mt-8">
          <p className="text-sm text-muted">Not signing in again? The songs on this device can go instead.</p>
          <TextButton onClick={() => setForgetting(true)}>Remove these songs from this device</TextButton>
        </div>
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
    </AuthLayout>
  );
}
