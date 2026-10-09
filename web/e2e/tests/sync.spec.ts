// Two devices on one account, as two separate browsers: the guest library joins the account, changes go
// both ways (notes too), an offline edit syncs once back online, a song changed on both becomes a change to settle,
// and signing out empties the device. Needs the local Supabase (`npm run db:start` in web/).
import type { Browser, Page } from '@playwright/test';
import { expect, test, watchCsp } from './csp';
import { linkInEmail, supabaseRunning } from './supabase';

const PASSWORD = 'correct horse battery';

test.beforeAll(async () => {
  test.skip(!(await supabaseRunning()), 'The local Supabase isn’t running: start it with npm run db:start in web/.');
});

/** A new browser, like another device: its own storage, nothing shared with the others. */
async function device(browser: Browser, blocked: string[]): Promise<Page> {
  const context = await browser.newContext();
  await watchCsp(context, blocked);
  return context.newPage();
}

/** Syncs now and waits for it to finish, from Settings → Sync and storage. */
async function syncNow(page: Page): Promise<void> {
  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByText(/^Synced at/)).toBeVisible();
}

const library = (page: Page) => page.getByRole('navigation', { name: 'Library' });

/** Changes a song's title in the editor and leaves it, which saves it. */
async function retitle(page: Page, song: RegExp, title: string): Promise<void> {
  await page.goto('/');
  await library(page).getByRole('link', { name: song }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill(title);
  await page.getByRole('link', { name: 'Songs' }).click();
  // The library shows the title once it's saved; going to another page before that could cut the save short.
  await expect(library(page).getByText(title)).toBeVisible();
}

test('two devices on one account', async ({ browser, blocked }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const a = await device(browser, blocked);
  const b = await device(browser, blocked);

  await test.step('a guest with songs creates an account and adds them', async () => {
    await a.goto('/');
    await a.getByRole('button', { name: 'Try the sample songs' }).click();
    await expect(library(a).getByText('Scarborough Fair')).toBeVisible();
    // The note on a guest's first songs leads to creating an account.
    await a.getByRole('dialog', { name: 'Your songs are kept only in this browser' }).getByRole('button', { name: 'Create account' }).click();
    await a.getByRole('textbox', { name: 'Email' }).fill(email);
    await a.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await a.getByLabel('Confirm password').fill(PASSWORD);
    await a.getByRole('button', { name: 'Create account' }).click();
    // The account is made once its email is confirmed: the link in it signs this device in.
    await expect(a.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await a.goto(await linkInEmail(email));
    await a.getByRole('button', { name: 'Add 6 songs to my account' }).click();
    // Settings stays closed until the question is answered; going there before it has been is sent back to it.
    await expect(a.getByRole('heading', { name: 'Add what’s on this device?' })).toBeHidden();
    await syncNow(a);
  });

  await test.step('another device signs in and gets the songs', async () => {
    await b.goto('/signin');
    await b.getByRole('textbox', { name: 'Email' }).fill(email);
    await b.getByLabel('Password').fill(PASSWORD);
    await b.getByRole('button', { name: 'Sign in' }).click();
    await expect(b.getByRole('button', { name: `Account: ${email}` })).toBeVisible();
    await syncNow(b);
    await b.goto('/');
    await expect(library(b).getByText('Scarborough Fair')).toBeVisible();
  });

  await test.step('a change on one device reaches the other', async () => {
    await retitle(a, /Oh! Susanna/, 'Oh! Susanna (live)');
    await syncNow(a);
    await syncNow(b);
    await b.goto('/');
    await expect(library(b).getByText('Oh! Susanna (live)')).toBeVisible();
  });

  await test.step('a note added on one device reaches the other', async () => {
    await a.goto('/');
    await library(a).getByRole('link', { name: /Scarborough Fair/ }).click();
    await a.getByRole('button', { name: '+ Line' }).first().click({ button: 'right' });
    await a.getByRole('menuitem', { name: 'Add note here' }).click();
    await a.keyboard.type('Capo 2');
    await a.keyboard.press('Enter');
    await a.getByRole('link', { name: 'Songs' }).click();
    // Opened again, the song shows the note once it's saved; syncing before that would send the song without it.
    await library(a).getByRole('link', { name: /Scarborough Fair/ }).click();
    await expect(a.getByRole('textbox', { name: 'Note' })).toHaveValue('Capo 2');
    await a.getByRole('link', { name: 'Songs' }).click();
    await syncNow(a);
    await syncNow(b);
    await b.goto('/');
    await library(b).getByRole('link', { name: /Scarborough Fair/ }).click();
    await expect(b.getByRole('textbox', { name: 'Note' })).toHaveValue('Capo 2');
  });

  await test.step('a change made offline syncs once back online', async () => {
    // The song is opened online: offline, the app works on in the page already open (pages can't be loaded).
    await a.goto('/');
    await library(a).getByRole('link', { name: /Twinkle/ }).click();
    await a.context().setOffline(true);
    await a.getByRole('textbox', { name: 'Title' }).fill('Twinkle (offline edit)');
    await a.getByRole('link', { name: 'Songs' }).click();
    await expect(library(a).getByText('Twinkle (offline edit)')).toBeVisible();
    await a.context().setOffline(false);
    await syncNow(a);
    await syncNow(b);
    await b.goto('/');
    await expect(library(b).getByText('Twinkle (offline edit)')).toBeVisible();
  });

  await test.step('a song changed on both devices becomes a change to settle', async () => {
    await a.goto('/');
    await library(a).getByRole('link', { name: /Auld Lang Syne/ }).click();
    await a.context().setOffline(true);
    await a.getByRole('textbox', { name: 'Title' }).fill('Auld Lang Syne (A)');
    await a.getByRole('link', { name: 'Songs' }).click();
    await expect(library(a).getByText('Auld Lang Syne (A)')).toBeVisible();
    await retitle(b, /Auld Lang Syne/, 'Auld Lang Syne (B)');
    await syncNow(b);
    await a.context().setOffline(false);

    await a.getByRole('link', { name: '1 change to settle' }).click();
    await expect(a.getByText('In your account')).toBeVisible();
    // Keep this device's copy: it replaces the other everywhere.
    await a.getByRole('button', { name: 'Keep this copy' }).first().click();
    await expect(a.getByText(/Nothing to settle/)).toBeVisible();
    await syncNow(a);
    await syncNow(b);
    await b.goto('/');
    await expect(library(b).getByText('Auld Lang Syne (A)')).toBeVisible();
  });

  await test.step('signing out empties the device', async () => {
    await b.getByRole('button', { name: `Account: ${email}` }).click();
    await b.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(b.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(b.getByRole('button', { name: 'Try the sample songs' })).toBeVisible();
  });
});
