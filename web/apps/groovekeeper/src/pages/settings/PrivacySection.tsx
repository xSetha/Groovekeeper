import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { saveLibraryExport } from '../../components/ExportLibrary';
import { DANGER, FormMessage, INPUT } from '../../components/forms';
import { db } from '../../library/db';
import { deleteAccount, useAccount } from '../../sync/account';
import { toast } from '../../toasts';
import { Group, SectionTitle } from './parts';

/** Settings → Privacy and data: what's kept and where, and deleting the account. */
export function PrivacySection() {
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <SectionTitle>Privacy and data</SectionTitle>
      <Group
        title="What’s kept about you"
        description="Your email, your songs and setlists, and when you signed in. No ads, no tracking."
      >
        <Link to="/privacy" className="text-accent hover:underline">
          Read the privacy page
        </Link>
      </Group>
      <Group title="Delete your account" description="Deletes the account and everything in it for good, and removes its songs from this device.">
        <button type="button" className={DANGER} onClick={() => setDeleting(true)}>
          Delete account…
        </button>
      </Group>
      {deleting ? <DeleteAccountDialog onCancel={() => setDeleting(false)} /> : null}
    </>
  );
}

/** Deleting can't be undone: the user types their email to confirm, and can export the library first. */
function DeleteAccountDialog({ onCancel }: { onCancel: () => void }) {
  const email = useAccount((s) => s.email) ?? '';
  const navigate = useNavigate();
  const counts = useLiveQuery(() => Promise.all([db.songs.count(), db.setlists.count()]), []);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [songs = 0, setlists = 0] = counts ?? [];
  const many = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);
  const what = [many(songs, 'song'), ...(setlists > 0 ? [many(setlists, 'setlist')] : [])].join(' and ');
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await deleteAccount();
    setBusy(false);
    if (result && 'error' in result) {
      setError(result.error);
      return;
    }
    toast('success', 'Your account is deleted', 'Its songs and setlists are gone, from this device too.');
    // Replacing /signin, where the settings page sent the user once signed out, so Back doesn't return to it.
    navigate('/', { replace: true });
  };

  return (
    <ConfirmDialog
      title="Delete your account for good?"
      message={`The account is deleted with its ${what}, and they’re removed from this device. Your other devices remove them when they next connect, or ask you to sign in again and offer to remove them. This can’t be undone: export the library first to keep a copy.`}
      confirmLabel="Delete account"
      confirmDisabled={!matches || busy}
      extra={{ label: 'Export library first', onClick: () => void saveLibraryExport() }}
      onCancel={onCancel}
      onConfirm={() => void confirm()}
    >
      <label className="mt-4 flex flex-col gap-1 text-sm">
        <span>
          Type <strong>{email}</strong> to confirm
        </span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} className={INPUT} autoComplete="off" />
      </label>
      {error ? (
        <div className="mt-3">
          <FormMessage error>{error}</FormMessage>
        </div>
      ) : null}
    </ConfirmDialog>
  );
}
