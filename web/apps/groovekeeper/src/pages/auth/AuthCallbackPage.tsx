import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { dismissLinkError, useAccount } from '../../sync/account';
import { toast } from '../../toasts';
import { AuthLayout } from './AuthLayout';

const SIGNED_IN: Record<string, [string, string]> = {
  signup: ['Your email is confirmed', 'You’re signed in.'],
  email_change: ['Your email is changed', 'Sign in with the new address from now on.'],
};

/**
 * /auth: where the links in the account's emails land. Once Supabase has read the link, the user goes where it
 * leads: a link that didn't work → sign in (which says why); forgot password → choose a new one; songs on this
 * device to settle → that question; otherwise home, signed in.
 */
export default function AuthCallbackPage() {
  // Read at start (startAccount), before the Supabase client takes the session out of the address.
  const link = useAccount((s) => s.emailLink) ?? { type: null, message: null };
  const status = useAccount((s) => s.status);
  const linkError = useAccount((s) => s.linkError !== null);
  const resetting = useAccount((s) => s.resettingPassword);
  const settling = useAccount((s) => s.guestLibrary !== null);
  const navigate = useNavigate();
  // The first of the two links of an email change: Supabase confirms it with a message and no session.
  const halfway = link.message !== null && status !== 'starting' && !resetting && !linkError;

  useEffect(() => {
    if (status === 'starting') return;
    if (linkError && status === 'signedIn') {
      // Signed in already (a link opened twice, or used up by a mail scanner): said once, nothing more to do.
      toast('info', 'That email link was already used', 'You’re signed in, so nothing more is needed.');
      dismissLinkError();
      navigate(settling ? '/welcome' : '/', { replace: true });
    } else if (linkError) navigate('/signin', { replace: true });
    else if (resetting) navigate('/forgot-password/new', { replace: true });
    else if (status === 'signedIn' && !halfway) {
      const [title, detail] = SIGNED_IN[link.type ?? ''] ?? ['Signed in', ''];
      toast('success', title, detail);
      navigate(settling ? '/welcome' : '/', { replace: true });
    } else if (status === 'guest' && !halfway) navigate('/signin', { replace: true });
  }, [linkError, status, resetting, settling, halfway, link.type, navigate]);

  if (!halfway) return null;
  return (
    <AuthLayout title="One address confirmed" intro={link.message}>
      <p className="mt-4">
        To finish changing your email, open the link we sent to the other address too.{' '}
        <Link to="/" className="text-accent hover:underline">
          Back to your songs
        </Link>
      </p>
    </AuthLayout>
  );
}
