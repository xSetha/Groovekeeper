// The note for guests in the library (src/components/GuestNote.tsx): their songs are only in this browser.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/library/db';
import { accountStore } from '../src/sync/account';

const renderApp = () =>
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

const library = () => within(screen.getByRole('navigation', { name: 'Library' }));
const NOTE = /These songs are only in this browser/;

/** Whether the browser says it keeps the site's data (navigator.storage, which jsdom doesn't have). */
function storageKept(kept: boolean): void {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persisted: async () => kept, persist: async () => kept },
  });
}

beforeEach(async () => {
  await db.songs.clear();
  localStorage.clear();
  sessionStorage.clear();
  accountStore.setState({ status: 'guest', userId: null, email: null });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'storage');
});

describe('the note for guests', () => {
  it('shows once a guest has songs, and its link opens Create an account', async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.queryByText(NOTE)).toBeNull();

    await user.click(await screen.findByRole('button', { name: 'Try the sample songs' }));
    expect(await library().findByText(NOTE)).toBeInTheDocument();

    await user.click(library().getByRole('link', { name: 'Create an account' }));
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeInTheDocument();
  });

  it('stays closed for this visit only while the browser may clear the songs', async () => {
    const user = userEvent.setup();
    storageKept(false);
    const { unmount } = renderApp();
    await user.click(await screen.findByRole('button', { name: 'Try the sample songs' }));
    await user.click(await library().findByRole('button', { name: 'Close' }));
    expect(library().queryByText(NOTE)).toBeNull();
    unmount();

    renderApp();
    await library().findByText('Amazing Grace');
    expect(library().queryByText(NOTE)).toBeNull();
    expect(localStorage.getItem('groovekeeper.guestNoteClosed')).toBeNull();
  });

  it('stays closed for good once the browser keeps the songs', async () => {
    const user = userEvent.setup();
    storageKept(true);
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Try the sample songs' }));
    await user.click(await library().findByRole('button', { name: 'Close' }));
    expect(localStorage.getItem('groovekeeper.guestNoteClosed')).toBe('1');
  });

  it('isn’t shown when signed in', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Try the sample songs' }));
    await library().findByText(NOTE);
    accountStore.setState({ status: 'signedIn', userId: 'me', email: 'me@example.com' });
    expect(await library().findByText('Amazing Grace')).toBeInTheDocument();
    expect(library().queryByText(NOTE)).toBeNull();
  });
});
