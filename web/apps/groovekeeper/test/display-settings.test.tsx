// Settings → Display and Export, and who can open Settings: guests too, but not the account's sections.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSettings, resetSettings } from '../src/settings';
import { setTheme } from '../src/themes';
import * as account from '../src/sync/account';
import { asGuest, renderAt, signedIn } from './account-mocks';

vi.mock('../src/sync/account', async (original) => ({
  ...(await original<typeof account>()),
  ...(await import('./account-doubles')).accountDoubles,
}));

beforeEach(() => {
  vi.clearAllMocks();
  asGuest();
});

afterEach(() => {
  resetSettings();
  setTheme('amp');
});

describe('Settings for a guest', () => {
  it('opens from the gear in the top bar, with the sections that need no account', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('link', { name: 'Settings' }));

    const nav = within(await screen.findByRole('navigation', { name: 'Settings' }));
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual(['Display', 'Export', 'About']);
    expect(screen.getByRole('heading', { name: 'Display' })).toBeInTheDocument();
  });

  it('sends a guest who asks for the account to Sign in', async () => {
    renderAt('/settings/account');

    expect(await screen.findByRole('heading', { name: /Sign in/ })).toBeInTheDocument();
  });
});

describe('Settings → Display', () => {
  it('changes how chords are written for the whole app, and the text size', async () => {
    const user = userEvent.setup();
    renderAt('/settings/display');

    await user.click(await screen.findByRole('radio', { name: /Do Re Mi/ }));
    await user.click(screen.getByRole('radio', { name: /Large/ }));

    expect(getSettings()).toMatchObject({ chords: 'solfege', textSize: 'large' });
    expect(JSON.parse(localStorage.getItem('groovekeeper.settings')!)).toMatchObject({ chords: 'solfege', textSize: 'large' });
    await user.click(screen.getByRole('radio', { name: /Roman numerals/ }));
    expect(getSettings().chords).toBe('numerals');
  });

  it('picks the theme too', async () => {
    const user = userEvent.setup();
    renderAt('/settings/display');

    await user.click(await within(await screen.findByRole('group', { name: 'Theme', hidden: false })).findByRole('button', { name: /Songbook/ }));

    expect(document.documentElement.dataset.theme).toBe('songbook');
  });
});

describe('Settings → Export', () => {
  it('sets where an export starts: repeats collapsed or not, and the paper', async () => {
    const user = userEvent.setup();
    renderAt('/settings/export');

    await user.click(await screen.findByRole('checkbox', { name: /Collapse repeated sections/ }));
    await user.click(screen.getByRole('radio', { name: 'US Letter' }));

    expect(getSettings()).toMatchObject({ collapseRepeats: false, paper: 'letter' });
  });
});

describe('Settings for a signed-in user', () => {
  it('has the account sections too, after Display and Export', async () => {
    signedIn();
    renderAt('/settings');

    const nav = within(await screen.findByRole('navigation', { name: 'Settings' }));
    expect(nav.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Display', 'Export', 'Account', 'Sync and storage', 'Privacy and data', 'About',
    ]);
  });
});
