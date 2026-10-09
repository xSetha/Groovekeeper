// What a guest is told about keeping songs: one dialog, on the first song they add, once per browser.
// And setlists, which are for accounts.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/library/db';
import { addSongs } from '../src/library/library';
import { sampleSongs } from '../src/library/samples';
import { asGuest, renderAt, signedIn } from './account-mocks';

const SHOWN_KEY = 'groovekeeper.guestWarningShown';
const TITLE = 'Your songs are kept only in this browser';

beforeEach(async () => {
  await db.songs.clear();
  localStorage.removeItem(SHOWN_KEY);
});

const song = sampleSongs()[0]!;

describe('the guest warning', () => {
  it('shows once, on the first song a guest adds', async () => {
    asGuest();
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Try the sample songs' }));
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(dialog).not.toBeInTheDocument();
    await addSongs([song]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
  });

  it('leads to creating an account', async () => {
    asGuest();
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('button', { name: 'Try the sample songs' }));
    await screen.findByRole('dialog', { name: TITLE });
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeInTheDocument();
  });

  it('isn’t shown signed in, or after a session ended', async () => {
    signedIn();
    renderAt('/');
    await addSongs([song]);
    asGuest({ endedSession: { email: 'me@example.com' } });
    await addSongs([song]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
    expect(localStorage.getItem(SHOWN_KEY)).toBeNull();
  });
});

describe('setlists', () => {
  it('are for accounts: a guest has no Setlists tab, and is asked to sign in', async () => {
    asGuest();
    renderAt('/setlists');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Setlists' })).toBeNull();
  });

  it('are in the top bar once signed in', async () => {
    signedIn();
    renderAt('/');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Setlists' })).toBeInTheDocument());
  });
});
