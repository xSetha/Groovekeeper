import { render, screen, waitFor } from '@testing-library/react';
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
  account.accountStore.setState({ status: 'guest', email: null, userId: null, sync: 'idle', lastSynced: null, guestLibrary: null, resettingPassword: false });
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

    expect(account.signIn).toHaveBeenCalledWith('me@example.com', 'not it');
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
});
