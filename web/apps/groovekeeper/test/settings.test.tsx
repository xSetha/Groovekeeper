// Settings (src/pages/settings) and the account menu in the top bar, for a signed-in user. The account's functions
// answer as Supabase would.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/library/db';
import * as account from '../src/sync/account';
import { asGuest, renderAt, signedIn } from './account-mocks';

vi.mock('../src/sync/account', async (original) => ({
  ...(await original<typeof account>()),
  ...(await import('./account-doubles')).accountDoubles,
}));

const song = (id: string, title: string, extra = {}) => ({
  id, title, artist: '', key: '', text: `${title}\n`, notes: [], updatedAt: 1, version: 1, dirty: 0 as const, ...extra,
});

beforeEach(async () => {
  vi.clearAllMocks();
  asGuest();
  signedIn();
  await Promise.all([db.songs.clear(), db.setlists.clear(), db.conflicts.clear()]);
});

describe('the account menu', () => {
  it('shows the account and how syncing stands, and opens Settings', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Account: me@example.com' }));
    // Who's signed in and how syncing stands are read as text beside the menu's items.
    const menu = within(screen.getByRole('menu', { name: 'Account' }));
    expect(screen.getAllByText('me@example.com')[0]).toBeInTheDocument();
    expect(screen.getByText('Not synced yet.')).toBeInTheDocument();
    // The keyboard is on the first item; arrows move between them.
    expect(menu.getByRole('menuitem', { name: 'Settings' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(menu.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{Enter}');
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
  });

  it('closes with Esc and gives the keyboard back to its button', async () => {
    const user = userEvent.setup();
    renderAt('/');
    const button = await screen.findByRole('button', { name: 'Account: me@example.com' });
    await user.click(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('signs out, asking first when changes haven\'t synced', async () => {
    const user = userEvent.setup();
    vi.mocked(account.hasUnsyncedChanges).mockResolvedValueOnce(true);
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Account: me@example.com' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await user.click(await screen.findByRole('button', { name: 'Sign out anyway' }));
    await waitFor(() => expect(account.signOut).toHaveBeenCalled());
  });
});

describe('the account menu while songs on this device wait for an answer', () => {
  it('offers only to finish signing in, not to sign out (that would lose them)', async () => {
    const user = userEvent.setup();
    signedIn({ guestLibrary: { songs: 3, setlists: 0 } });
    renderAt('/welcome');
    await user.click(await screen.findByRole('button', { name: 'Account: me@example.com' }));
    const menu = within(screen.getByRole('menu', { name: 'Account' }));
    expect(menu.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Finish signing in']);
  });
});

describe('Settings', () => {
  it('lists its sections, and opens the first at /settings', async () => {
    renderAt('/settings');
    const nav = within(await screen.findByRole('navigation', { name: 'Settings' }));
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Display', 'Export', 'Account', 'Sync and storage', 'Privacy and data', 'About',
    ]);
    expect(screen.getByRole('heading', { name: 'Display' })).toBeInTheDocument();
  });

  it('changes the password with the current one, saying when it isn\'t right', async () => {
    const user = userEvent.setup();
    vi.mocked(account.changePassword).mockResolvedValueOnce({ error: 'Your current password isn’t right.', code: 'invalid_credentials' });
    renderAt('/settings/account');
    await user.click(await screen.findByRole('link', { name: 'Change password' }));
    await user.type(screen.getByLabelText('Current password'), 'old one');
    await user.type(screen.getByLabelText('New password'), 'new one!!');
    await user.type(screen.getByLabelText('Confirm new password'), 'new one!!');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save password' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password isn’t right.');

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save password' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(account.changePassword).toHaveBeenLastCalledWith('old one', 'new one!!', expect.stringMatching(/^test-token-/));
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    // Back on the account page once it has drawn (it can lag the toast when many tests run at once).
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
  });

  it('asks for a new email, and says the change waits for both addresses', async () => {
    const user = userEvent.setup();
    vi.mocked(account.changeEmail).mockImplementationOnce(async (email) => {
      account.accountStore.setState({ newEmail: email });
      return null;
    });
    renderAt('/settings/account');
    await user.click(await screen.findByRole('button', { name: 'Change email' }));
    await user.type(screen.getByLabelText('New email'), 'new@example.com');
    await user.click(screen.getByRole('button', { name: 'Change email' }));
    expect(account.changeEmail).toHaveBeenCalledWith('new@example.com');
    expect(await screen.findByText(/we sent a link to both addresses/)).toBeInTheDocument();
  });

  it('signs out everywhere after asking, warning when changes haven\'t synced', async () => {
    const user = userEvent.setup();
    vi.mocked(account.hasUnsyncedChanges).mockResolvedValueOnce(true);
    renderAt('/settings/account');
    await user.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/haven’t reached your account: they’re lost/)).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(account.signOutEverywhere).toHaveBeenCalled());
    expect(await screen.findByText('Signed out everywhere')).toBeInTheDocument();
  });

  it('doesn\'t offer to import on a phone, where songs are only read', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('pointer: coarse') || query.includes('max-width: 767px'),
      addEventListener() {},
      removeEventListener() {},
    }));
    try {
      renderAt('/settings/sync');
      expect(await screen.findByRole('button', { name: 'Export library' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Import…' })).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows how much the account holds, and lists what isn\'t in it and why', async () => {
    await db.songs.bulkAdd([
      song('a', 'Amazing Grace'),
      song('b', 'Song 201', { version: 0, dirty: 1, refused: { reason: 'limit', at: 1 } }),
      song('c', 'Long song', { version: 0, dirty: 1, refused: { reason: 'size', at: 1 } }),
    ]);
    renderAt('/settings/sync');
    expect(await screen.findByRole('meter', { name: 'Songs in your account' })).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('1 of 200')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Song 201' }).parentElement).toHaveTextContent('the account is full');
    expect(screen.getByRole('link', { name: 'Long song' }).parentElement).toHaveTextContent('too long to sync');
  });

  it('deletes the account only once the email is typed', async () => {
    const user = userEvent.setup();
    renderAt('/settings/privacy');
    await user.click(await screen.findByRole('button', { name: 'Delete account…' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Delete your account for good?' }));
    expect(dialog.getByRole('button', { name: 'Export library first' })).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Delete account' })).toBeDisabled();

    await user.type(dialog.getByRole('textbox'), 'ME@example.com');
    await user.click(dialog.getByRole('button', { name: 'Delete account' }));
    expect(account.deleteAccount).toHaveBeenCalled();
    expect(await screen.findByText('Your account is deleted')).toBeInTheDocument();
  });

  it('says why the account couldn\'t be deleted', async () => {
    const user = userEvent.setup();
    vi.mocked(account.deleteAccount).mockResolvedValueOnce({ error: 'You’re offline. Connect to the internet to delete your account.' });
    renderAt('/settings/privacy');
    await user.click(await screen.findByRole('button', { name: 'Delete account…' }));
    await user.type(screen.getByRole('textbox'), 'me@example.com');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete account' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('You’re offline');
  });

  it('says what Groovekeeper is and where its code is', async () => {
    renderAt('/settings/about');
    expect(await screen.findByRole('link', { name: 'The code, on GitHub' })).toHaveAttribute('href', 'https://github.com/xSetha/Groovekeeper');
  });

  it('shows a song changed on two devices side by side, and keeps the copy picked', async () => {
    const user = userEvent.setup();
    await db.songs.add({ id: 'grace', title: 'Amazing Grace', artist: '', key: '', text: 'Changed here\n', updatedAt: 0, version: 1, dirty: 1 });
    await db.conflicts.add({
      id: 'grace', table: 'songs',
      remote: { id: 'grace', title: 'Amazing Grace', artist: '', key: '', text: 'Changed there\n', notes: [], deleted: false, version: 2, updated_at: '' },
    });
    renderAt('/');
    await user.click(await screen.findByRole('link', { name: '1 change to settle' }));
    await user.click((await screen.findAllByRole('button', { name: 'Keep this copy' }))[1]!);
    await waitFor(async () => expect((await db.songs.get('grace'))?.text).toBe('Changed there\n'));
    expect(account.runSync).toHaveBeenCalled();
  });
});
