import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { PRIMARY, SECONDARY } from '../../components/forms';
import { keepOtherAccountsSongs, settleGuestLibrary, useAccount } from '../../sync/account';
import { AuthLayout } from './AuthLayout';

/**
 * /welcome: just signed in, with songs or setlists on this device. Made as a guest: add them to the account, or
 * remove them here. Another account's (its session ended here): remove them, or keep them and sign out.
 */
export default function WelcomePage() {
  const library = useAccount((s) => s.guestLibrary);
  const starting = useAccount((s) => s.status === 'starting');
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  // Reloaded here, the question is known once the session is.
  if (starting) return null;
  if (!library) return <Navigate to="/" replace />;

  const { songs, setlists, otherAccount } = library;
  const count = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);
  // Only what's there: "6 songs and 2 setlists", "6 songs" or "2 setlists".
  const what = [songs > 0 ? count(songs, 'song') : null, setlists > 0 ? count(setlists, 'setlist') : null].filter(Boolean).join(' and ');
  const them = songs + setlists === 1 ? 'it' : 'them';
  const act = (work: () => Promise<void>, then: string) => {
    setBusy(true);
    void work()
      .then(() => navigate(then, { replace: true }))
      .finally(() => setBusy(false));
  };

  if (otherAccount) {
    return (
      <AuthLayout title="Remove another account’s songs?">
        <p className="mt-3">
          This browser has {what} of {otherAccount.email ?? 'another account'}, which was signed in here before. They stay
          in that account, if it still exists; changes made here that never synced are lost. Remove {them} from this
          device to use your account here.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" disabled={busy} className={PRIMARY} onClick={() => act(() => settleGuestLibrary(false), '/')}>
            Remove {them} from this device
          </button>
          <button type="button" disabled={busy} className={SECONDARY} onClick={() => act(keepOtherAccountsSongs, '/signin')}>
            Keep them and sign out
          </button>
        </div>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Add what’s on this device?">
      <p className="mt-3">
        This browser has {what}, made before you signed in. Add {them} to your account to keep {them}, or remove {them}{' '}
        from this device to start from what’s in your account.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={busy} className={PRIMARY} onClick={() => act(() => settleGuestLibrary(true), '/')}>
          Add {what} to my account
        </button>
        <button type="button" disabled={busy} className={SECONDARY} onClick={() => act(() => settleGuestLibrary(false), '/')}>
          Remove {them} from this device
        </button>
      </div>
    </AuthLayout>
  );
}
