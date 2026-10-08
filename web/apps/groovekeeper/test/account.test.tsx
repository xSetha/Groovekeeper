import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/library/db';
import * as account from '../src/sync/account';

// Signing in talks to Supabase; here the account's functions answer as Supabase would.
vi.mock('../src/sync/account', async (importOriginal) => ({
  ...(await importOriginal<typeof account>()),
  signIn: vi.fn(),
  signUp: vi.fn(),
  setNewPassword: vi.fn(() => Promise.resolve(null)),
  settleGuestLibrary: vi.fn(() => Promise.resolve()),
  hasUnsyncedChanges: vi.fn(),
  signOut: vi.fn(() => Promise.resolve()),
  deleteAccount: vi.fn(() => Promise.resolve(null)),
  resendConfirmation: vi.fn(() => Promise.resolve(null)),
  forgetEndedSession: vi.fn(() => Promise.resolve()),
  runSync: vi.fn(() => Promise.resolve()),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const signedIn = (extra: Partial<account.AccountState> = {}) =>
  account.accountStore.setState({ status: 'signedIn', email: 'me@example.com', userId: 'me', guestLibrary: null, ...extra });

beforeEach(async () => {
  vi.clearAllMocks();
  account.accountStore.setState({
    status: 'guest', email: null, userId: null, sync: 'idle', lastSynced: null, guestLibrary: null, resettingPassword: false,
    endedSession: null, linkError: null,
  });
  await Promise.all([db.songs.clear(), db.conflicts.clear()]);
});

describe('the account', () => {
  it('offers Sign in in the top bar, and says what went wrong signing in', async () => {
    const user = userEvent.setup();
    vi.mocked(account.signIn).mockResolvedValue({ error: 'Wrong email or password.' });
    renderAt('/');

    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    await user.type(await screen.findByRole('textbox', { name: 'Email' }), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'not it');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(account.signIn).toHaveBeenCalledWith('me@example.com', 'not it', expect.stringMatching(/^test-token-/));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
  });

  it('asks to confirm the email after creating an account', async () => {
    const user = userEvent.setup();
    vi.mocked(account.signUp).mockResolvedValue({ confirmEmail: true });
    renderAt('/account');

    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.type(screen.getByLabelText('Confirm password'), 'long enough');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
  });

  it('doesn’t create an account when the two passwords differ', async () => {
    const user = userEvent.setup();
    renderAt('/account');

    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.type(screen.getByLabelText('Confirm password'), 'long enuogh');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The passwords don’t match.');
    expect(account.signUp).not.toHaveBeenCalled();
  });

  it('saves a new password from a reset link only when both boxes match', async () => {
    const user = userEvent.setup();
    account.accountStore.setState({ resettingPassword: true });
    renderAt('/account');

    await user.type(await screen.findByLabelText('New password'), 'long enough');
    await user.type(screen.getByLabelText('Confirm new password'), 'long enuogh');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The passwords don’t match.');
    expect(account.setNewPassword).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(screen.getByLabelText('Confirm new password'), 'long enough');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(account.setNewPassword).toHaveBeenCalledWith('long enough');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('asks whether to add what was made as a guest, naming only what is there', async () => {
    const user = userEvent.setup();
    signedIn({ guestLibrary: { songs: 3, setlists: 1 } });
    const { unmount } = renderAt('/account');

    await user.click(await screen.findByRole('button', { name: 'Add 3 songs and 1 setlist to my account' }));
    expect(account.settleGuestLibrary).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole('button', { name: 'Remove them from this device' }));
    expect(account.settleGuestLibrary).toHaveBeenCalledWith(false);
    unmount();

    signedIn({ guestLibrary: { songs: 0, setlists: 2 } });
    renderAt('/account');
    expect(await screen.findByRole('button', { name: 'Add 2 setlists to my account' })).toBeInTheDocument();
  });

  it('warns before signing out with changes that haven\'t synced', async () => {
    const user = userEvent.setup();
    vi.mocked(account.hasUnsyncedChanges).mockResolvedValue(true);
    signedIn();
    renderAt('/account');

    expect(await screen.findByText('me@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await user.click(await screen.findByRole('button', { name: 'Sign out anyway' }));
    await waitFor(() => expect(account.signOut).toHaveBeenCalled());
  });

  it('signs out straight away when everything has synced', async () => {
    const user = userEvent.setup();
    vi.mocked(account.hasUnsyncedChanges).mockResolvedValue(false);
    signedIn();
    renderAt('/account');

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(account.signOut).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a song changed on two devices side by side, and keeps the copy picked', async () => {
    const user = userEvent.setup();
    signedIn();
    await db.songs.add({ id: 'grace', title: 'Amazing Grace', artist: '', key: '', text: 'Changed here\n', updatedAt: 0, version: 1, dirty: 1 });
    await db.conflicts.add({
      id: 'grace', table: 'songs',
      remote: { id: 'grace', title: 'Amazing Grace', artist: '', key: '', text: 'Changed there\n', notes: [], deleted: false, version: 2, updated_at: '' },
    });
    renderAt('/');

    await user.click(await screen.findByRole('link', { name: '1 change to settle' }));
    expect(await screen.findByText('Changed here')).toBeInTheDocument();
    expect(screen.getByText('Changed there')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Keep this copy' })[1]!);
    await waitFor(async () => expect((await db.songs.get('grace'))?.text).toBe('Changed there\n'));
    expect(await screen.findByText(/Nothing to settle/)).toBeInTheDocument();
    expect(account.runSync).toHaveBeenCalled();
  });

  it('says which songs the account refused, and marks them in the library', async () => {
    signedIn();
    const refused = { title: 'Song 201', artist: '', key: '', text: 'Song 201\n', notes: [], updatedAt: 1, version: 0, dirty: 1 as const };
    await db.songs.bulkPut([
      { ...refused, id: 'one', refused: { reason: 'limit', at: 1 } },
      { ...refused, id: 'two', title: 'Song 202', refused: { reason: 'limit', at: 1 } },
    ]);
    const { unmount } = renderAt('/account');
    expect(await screen.findByText(/2 songs aren’t in your account: it holds up to 200 songs/)).toBeInTheDocument();
    unmount();

    renderAt('/');
    const library = within(await screen.findByRole('navigation', { name: 'Library' }));
    expect(await library.findAllByText('Not in your account')).toHaveLength(2);
  });

  it('deletes the account after asking, and offers to export the library first', async () => {
    const user = userEvent.setup();
    signedIn();
    renderAt('/account');

    await user.click(await screen.findByRole('button', { name: 'Delete account' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Delete your account for good?' }));
    expect(dialog.getByRole('button', { name: 'Export library first' })).toBeInTheDocument();
    expect(account.deleteAccount).not.toHaveBeenCalled();

    await user.click(dialog.getByRole('button', { name: 'Delete account' }));
    expect(account.deleteAccount).toHaveBeenCalled();
    expect(await screen.findByText('Your account is deleted')).toBeInTheDocument();
  });

  it('says why the account couldn\'t be deleted', async () => {
    const user = userEvent.setup();
    vi.mocked(account.deleteAccount).mockResolvedValueOnce({ error: 'You’re offline. Connect to the internet to delete your account.' });
    signedIn();
    renderAt('/account');

    await user.click(await screen.findByRole('button', { name: 'Delete account' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You’re offline');
  });

  it('asks to sign in again after the session ended, or to remove the songs instead', async () => {
    const user = userEvent.setup();
    account.accountStore.setState({ endedSession: { email: 'me@example.com' } });
    renderAt('/account');

    expect(await screen.findByRole('heading', { name: 'Sign in again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in again' })).toBeInTheDocument(); // in the top bar
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('me@example.com');

    await user.click(screen.getByRole('button', { name: 'Remove these songs from this device' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove them' }));
    expect(account.forgetEndedSession).toHaveBeenCalled();
  });

  it('sends a new token from the check against bots with every try', async () => {
    const user = userEvent.setup();
    vi.mocked(account.signIn).mockResolvedValue({ error: 'Wrong email or password.' });
    renderAt('/account');
    await user.type(await screen.findByRole('textbox', { name: 'Email' }), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'not it');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const tokens = vi.mocked(account.signIn).mock.calls.map((call) => call[2]);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).not.toBe(tokens[1]);
  });

  it('says when the check against bots didn\'t load, and keeps the button off', async () => {
    const working = window.turnstile;
    window.turnstile = {
      ...working!,
      render: (_box, options) => {
        queueMicrotask(() => (options['error-callback'] as () => void)());
        return 'failing';
      },
    };
    try {
      renderAt('/account');
      expect(await screen.findByText(/didn’t pass\. Reload the page/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    } finally {
      window.turnstile = working;
    }
  });

  it('explains an email link that expired, and sends a new confirmation', async () => {
    const user = userEvent.setup();
    account.accountStore.setState({ linkError: { code: 'otp_expired', expired: true } });
    renderAt('/');

    expect(await screen.findByText('That email link has expired or was already used')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send the confirmation email again' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Send the confirmation email again' }));
    expect(account.resendConfirmation).toHaveBeenCalledWith('new@example.com', expect.stringMatching(/^test-token-/));
    expect(await screen.findByText(/a new link is on its way/)).toBeInTheDocument();
  });

  it('after creating an account, offers to send the email again and says when none comes', async () => {
    const user = userEvent.setup();
    vi.mocked(account.signUp).mockResolvedValue({ confirmEmail: true });
    renderAt('/account');
    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.type(screen.getByLabelText('Confirm password'), 'long enough');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/Already have an account with this email\? Then no email comes/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send the email again' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Send the email again' }));
    expect(account.resendConfirmation).toHaveBeenCalledWith('new@example.com', expect.stringMatching(/^test-token-/));
  });

  it('opens the account page for a password reset link, wherever it landed', async () => {
    account.accountStore.setState({ resettingPassword: true });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
  });

  it('names who runs the site on the privacy page, linked from creating an account', async () => {
    const user = userEvent.setup();
    renderAt('/account');
    await user.click(await screen.findByRole('button', { name: 'Create an account' }));
    await user.click(screen.getByRole('link', { name: 'privacy page' }));
    expect(await screen.findByRole('heading', { name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText(/run by the person running this copy/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'privacy@example.com' })[0]).toHaveAttribute('href', 'mailto:privacy@example.com');
  });

  it('opens the account page once for a link that didn\'t work, and lets the user leave it', async () => {
    const user = userEvent.setup();
    signedIn();
    account.accountStore.setState({ linkError: { code: 'otp_expired', expired: true } });
    renderAt('/');

    expect(await screen.findByText(/You’re signed in already, so nothing is needed here/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Songs' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Account' })).toBeNull());

    await user.click(screen.getByRole('link', { name: /^Account/ }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/That email link/)).toBeNull();
  });

  it('lets the user keep their password after opening a reset link', async () => {
    const user = userEvent.setup();
    account.accountStore.setState({ resettingPassword: true });
    renderAt('/account');
    await user.click(await screen.findByRole('button', { name: 'Keep my password' }));
    expect(account.accountStore.getState().resettingPassword).toBe(false);
  });

  it('says when the check against bots can\'t run in this browser', async () => {
    const working = window.turnstile;
    window.turnstile = {
      ...working!,
      render: (_box, options) => {
        queueMicrotask(() => (options['unsupported-callback'] as () => void)());
        return 'unsupported';
      },
    };
    try {
      renderAt('/account');
      expect(await screen.findByText(/doesn’t work in this browser/)).toBeInTheDocument();
    } finally {
      window.turnstile = working;
    }
  });
});
