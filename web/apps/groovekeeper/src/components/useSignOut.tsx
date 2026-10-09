import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { hasUnsyncedChanges, signOut } from '../sync/account';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * Signing out from anywhere (the account menu, Settings): straight away when everything has synced, otherwise
 * after asking, since changes that never reached the account are lost. Render `dialog` where the hook is used.
 */
export function useSignOut(): { signOut: () => void; busy: boolean; dialog: ReactNode } {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const leave = async () => {
    setAsking(false);
    await signOut();
    // In place of the page signed out from (Settings has already gone to /signin), so Back doesn't return to it.
    navigate('/', { replace: true });
  };
  const start = () => {
    setBusy(true);
    void hasUnsyncedChanges()
      .then((unsynced) => (unsynced ? setAsking(true) : leave()))
      .finally(() => setBusy(false));
  };

  const dialog = asking ? (
    <ConfirmDialog
      title="Some changes haven’t synced"
      message="Changes made on this device since the last sync haven’t reached your account. If you sign out now, they’re lost."
      confirmLabel="Sign out anyway"
      onCancel={() => setAsking(false)}
      onConfirm={() => void leave()}
    />
  ) : null;
  return { signOut: start, busy, dialog };
}
