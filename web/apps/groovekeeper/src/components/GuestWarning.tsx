import { useNavigate } from 'react-router';
import { closeGuestWarning, useGuestWarningOpen } from '../guestWarning';
import { ConfirmDialog } from './ConfirmDialog';

/** Shown once, when a guest adds their first song: the songs are only in this browser until they create an account. */
export function GuestWarning() {
  const open = useGuestWarningOpen();
  const navigate = useNavigate();
  if (!open) return null;
  return (
    <ConfirmDialog
      title="Your songs are kept only in this browser"
      message="Until you create an account, they're saved only here, on this device. An account keeps them safe, on every device you sign in on."
      cancelLabel="OK"
      confirmLabel="Create account"
      onCancel={closeGuestWarning}
      onConfirm={() => {
        closeGuestWarning();
        navigate('/signup');
      }}
    />
  );
}
