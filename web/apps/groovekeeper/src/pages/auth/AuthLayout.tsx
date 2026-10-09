// The frame of the sign-in pages (/signin, /signup, /forgot-password, ...), and who may open which pages.
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { LinkErrorBanner } from '../../components/forms';
import { useAccount } from '../../sync/account';

/** A narrow page with a title and a line under it, and the banner for an email link that didn't work. */
export function AuthLayout({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} – Groovekeeper`;
  }, [title]);
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-md px-4 py-8">
        <LinkErrorBanner />
        <h1 className="text-2xl font-semibold">{title}</h1>
        {intro ? <p className="mt-2 text-muted">{intro}</p> : null}
        {children}
      </div>
    </main>
  );
}

/** Where someone just signed in goes: the question about songs on this device first, if there's one. */
export function useAfterSignIn(): string {
  const settling = useAccount((s) => s.guestLibrary !== null);
  const from = (useLocation().state as { from?: string } | null)?.from;
  return settling ? '/welcome' : (from ?? '/');
}

/** The sign-in pages are for guests: once signed in (even by a page of theirs), the user moves on. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useAccount((s) => s.status);
  const next = useAfterSignIn();
  if (status === 'starting') return null;
  if (status === 'signedIn') return <Navigate to={next} replace />;
  return children;
}

/** Settings is for signed-in users; songs on this device to settle come first. */
export function SignedInOnly({ children }: { children: ReactNode }) {
  const status = useAccount((s) => s.status);
  const settling = useAccount((s) => s.guestLibrary !== null);
  const { pathname } = useLocation();
  if (status === 'starting') return null;
  if (status === 'guest') return <Navigate to="/signin" state={{ from: pathname }} replace />;
  if (settling) return <Navigate to="/welcome" replace />;
  return children;
}

/** The old /account page, still in emails sent before: the new pages instead. */
export function AccountRedirect() {
  const status = useAccount((s) => s.status);
  const resetting = useAccount((s) => s.resettingPassword);
  const linkError = useAccount((s) => s.linkError !== null);
  if (status === 'starting') return null;
  if (resetting) return <Navigate to="/forgot-password/new" replace />;
  // /auth says what went wrong with the link, and forgets it.
  if (linkError) return <Navigate to="/auth" replace />;
  return <Navigate to={status === 'signedIn' ? '/settings/account' : '/signin'} replace />;
}
