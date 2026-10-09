// What the account pages' tests share: the account's functions answer as Supabase would, and a page is rendered
// at an address with the whole app around it.
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../src/App';
import * as account from '../src/sync/account';

export const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

export const asGuest = (extra: Partial<account.AccountState> = {}) =>
  account.accountStore.setState({
    status: 'guest', email: null, userId: null, sync: 'idle', lastSynced: null, guestLibrary: null, resettingPassword: false,
    endedSession: null, linkError: null, newEmail: null, emailLink: null, ...extra,
  });

export const signedIn = (extra: Partial<account.AccountState> = {}) =>
  account.accountStore.setState({ status: 'signedIn', email: 'me@example.com', userId: 'me', guestLibrary: null, ...extra });
