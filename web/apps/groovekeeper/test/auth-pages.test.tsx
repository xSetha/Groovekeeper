// The sign-in pages (src/pages/auth): sign in, create an account, forgot password, email links, and the question
// about songs on this device after signing in. The account's functions answer as Supabase would.
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

/** The button is on once the check against bots has given a token. */
const ready = (name: string) => waitFor(() => expect(screen.getByRole('button', { name })).toBeEnabled());

beforeEach(async () => {
  vi.clearAllMocks();
  asGuest();
  await Promise.all([db.songs.clear(), db.setlists.clear(), db.conflicts.clear()]);
});

describe('signing in', () => {
  it('is in the top bar, says what went wrong, and sends a new token with every try', async () => {
    const user = userEvent.setup();
    vi.mocked(account.signIn).mockResolvedValue({ error: 'Wrong email or password.', code: 'invalid_credentials' });
    renderAt('/');
    await user.click(within(screen.getByRole('banner')).getByRole('link', { name: 'Sign in' }));

    await user.type(await screen.findByRole('textbox', { name: 'Email' }), 'me@example.com');
    await user.type(screen.getByLabelText('Password'), 'not it');
    await ready('Sign in');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password.');
    await ready('Sign in');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const tokens = vi.mocked(account.signIn).mock.calls.map((call) => call[2]);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).not.toBe(tokens[1]);
  });

  it('moves on once signed in: home, or the question about songs on this device', async () => {
    renderAt('/signin');
    await screen.findByRole('heading', { name: 'Sign in' });
    signedIn({ guestLibrary: { songs: 3, setlists: 1 } });
    expect(await screen.findByRole('heading', { name: 'Add what’s on this device?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add 3 songs and 1 setlist to my account' })).toBeInTheDocument();
  });

  it('offers to remove another account\'s songs, or keep them and sign out, never to add them', async () => {
    const user = userEvent.setup();
    signedIn({ guestLibrary: { songs: 2, setlists: 0, otherAccount: { email: 'old@example.com' } } });
    renderAt('/welcome');
    expect(await screen.findByText(/This browser has 2 songs of old@example.com/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /to my account/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Keep them and sign out' }));
    expect(account.keepOtherAccountsSongs).toHaveBeenCalled();
  });

  it('after a session ended, says so, fills in the email, and offers to remove the songs instead', async () => {
    const user = userEvent.setup();
    asGuest({ endedSession: { email: 'me@example.com' } });
    renderAt('/signin');

    expect(await screen.findByText(/Your session on this device ended/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('me@example.com');
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove these songs from this device' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove them' }));
    expect(account.forgetEndedSession).toHaveBeenCalled();
  });

  it('says when the check against bots didn\'t pass, or can\'t run in this browser, and keeps the button off', async () => {
    const working = window.turnstile;
    for (const [callback, text] of [['error-callback', /didn’t pass\. Reload the page/], ['unsupported-callback', /doesn’t work in this browser/]] as const) {
      window.turnstile = {
        ...working!,
        render: (_box, options) => {
          queueMicrotask(() => (options[callback] as () => void)());
          return callback;
        },
      };
      const { unmount } = renderAt('/signin');
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
      unmount();
    }
    window.turnstile = working;
  });

  it('sends a signed-in user on from the sign-in pages, and a guest from Settings to sign in', async () => {
    signedIn();
    const { unmount } = renderAt('/signup');
    expect(await screen.findByRole('button', { name: /^Account/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create an account' })).toBeNull();
    unmount();

    asGuest();
    renderAt('/settings/account');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

describe('creating an account', () => {
  it('needs the password twice, then asks to confirm the email and can send it again', async () => {
    const user = userEvent.setup();
    vi.mocked(account.signUp).mockResolvedValue({ confirmEmail: true });
    renderAt('/signin');
    await user.click(await screen.findByRole('link', { name: 'Create an account' }));
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'long enough');
    await user.type(screen.getByLabelText('Confirm password'), 'long enuogh');
    await ready('Create account');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The passwords don’t match.');
    expect(account.signUp).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), 'long enough');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText(/Already have an account with this email\? Then no email comes/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send the email again' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Send the email again' }));
    expect(account.resendConfirmation).toHaveBeenCalledWith('new@example.com', expect.stringMatching(/^test-token-/));
  });

  it('links the privacy page, which names who runs the site', async () => {
    const user = userEvent.setup();
    renderAt('/signup');
    await user.click(await screen.findByRole('link', { name: 'privacy page' }));
    expect(await screen.findByRole('heading', { name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText(/run by the person running this copy/)).toBeInTheDocument();
  });
});

describe('forgot password', () => {
  it('sends a link from the sign-in page, with the email typed there', async () => {
    const user = userEvent.setup();
    renderAt('/signin');
    await user.type(await screen.findByRole('textbox', { name: 'Email' }), 'me@example.com');
    await user.click(screen.getByRole('link', { name: 'Forgot password?' }));
    expect(await screen.findByRole('textbox', { name: 'Email' })).toHaveValue('me@example.com');
    await ready('Send the link');
    await user.click(screen.getByRole('button', { name: 'Send the link' }));
    expect(account.sendPasswordReset).toHaveBeenCalledWith('me@example.com', expect.stringMatching(/^test-token-/));
    expect(await screen.findByText(/a link to choose a new password is on its way/)).toBeInTheDocument();
  });

  it('chooses a new password from the email\'s link, both boxes matching', async () => {
    const user = userEvent.setup();
    signedIn({ resettingPassword: true });
    renderAt('/auth');
    await user.type(await screen.findByLabelText('New password'), 'long enough');
    await user.type(screen.getByLabelText('Confirm new password'), 'long enuogh');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The passwords don’t match.');
    expect(account.setNewPassword).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(screen.getByLabelText('Confirm new password'), 'long enough');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(account.setNewPassword).toHaveBeenCalledWith('long enough');
    expect(await screen.findByText('Password changed')).toBeInTheDocument();
  });

  it('goes on to the question about songs on this device, if one waits', async () => {
    const user = userEvent.setup();
    signedIn({ resettingPassword: true, guestLibrary: { songs: 2, setlists: 0 } });
    renderAt('/forgot-password/new');
    await user.type(await screen.findByLabelText('New password'), 'long enough');
    await user.type(screen.getByLabelText('Confirm new password'), 'long enough');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByRole('heading', { name: 'Add what’s on this device?' })).toBeInTheDocument();
  });

  it('can be left: the user stays signed in and the page isn\'t forced on them', async () => {
    const user = userEvent.setup();
    signedIn({ resettingPassword: true });
    renderAt('/forgot-password/new');
    await screen.findByRole('heading', { name: 'Choose a new password' });
    await user.click(screen.getByRole('link', { name: 'Songs' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Choose a new password' })).toBeNull());
  });
});

describe('email links', () => {
  it('a link that didn\'t work goes to sign in, which says why and can send the confirmation again', async () => {
    const user = userEvent.setup();
    asGuest({ linkError: { code: 'otp_expired', expired: true } });
    renderAt('/auth');
    expect(await screen.findByText('That email link has expired or was already used')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send the confirmation email again' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Send the confirmation email again' }));
    expect(account.resendConfirmation).toHaveBeenCalledWith('new@example.com', expect.stringMatching(/^test-token-/));
  });

  it('a confirmation link signs in and goes home, saying so', async () => {
    // As startAccount reads it from the link's address.
    signedIn({ emailLink: { type: 'signup', message: null } });
    renderAt('/auth');
    expect(await screen.findByText('Your email is confirmed')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'New song' })).toBeInTheDocument();
  });

  it('a used link opened while signed in says so once, and is forgotten', async () => {
    signedIn({ linkError: { code: 'otp_expired', expired: true } });
    renderAt('/auth');
    expect(await screen.findByText('That email link was already used')).toBeInTheDocument();
    expect(account.accountStore.getState().linkError).toBeNull();
  });

  it('a link that landed on the start page goes on to where it leads', async () => {
    signedIn({ resettingPassword: true });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
  });

  it('a confirmation link that landed on the start page still asks about the songs on this device', async () => {
    signedIn({ emailLink: { type: 'signup', message: null }, guestLibrary: { songs: 2, setlists: 0 } });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Add what’s on this device?' })).toBeInTheDocument();
  });

  it('the old account page sends each user to the new pages', async () => {
    signedIn();
    const { unmount } = renderAt('/account');
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
    unmount();
    asGuest();
    renderAt('/account');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});
