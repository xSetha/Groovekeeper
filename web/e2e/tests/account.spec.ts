// The account forms in a real browser, with Cloudflare's Turnstile check (its test key, which passes) and the
// local Supabase checking each token. Needs the local Supabase (`npm run db:start` in web/).
import type { Page } from '@playwright/test';
import { expect, test } from './csp';
import { linkInEmail, supabaseRunning } from './supabase';

const PASSWORD = 'correct horse battery';

/** Signs in from /signin and waits until the account menu shows the account. */
async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/signin');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: `Account: ${email}` })).toBeVisible();
}

/** Signs out from the account menu. */
async function signOut(page: Page, email: string): Promise<void> {
  await page.getByRole('button', { name: `Account: ${email}` }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();
}

/** A new account, confirmed through the link in its email (which signs this page in). */
async function newAccount(page: Page, email: string): Promise<void> {
  await page.goto('/signup');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.goto(await linkInEmail(email));
  await expect(page.getByText('Your email is confirmed')).toBeVisible();
  await expect(page.getByRole('button', { name: `Account: ${email}` })).toBeVisible();
}

test('a new account confirms its email, and signs in after a wrong password with a new check', async ({ page }) => {
  test.skip(!(await supabaseRunning()), 'The local Supabase isn’t running: start it with npm run db:start in web/.');
  const email = `e2e-${Date.now()}-account@example.com`;
  await newAccount(page, email);
  await signOut(page, email);

  await page.goto('/signin');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('not the password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');
  // A token works once: the second try gets a new one.
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: `Account: ${email}` })).toBeVisible();
});

test('changes the password in Settings, and chooses a new one with Forgot password', async ({ page }) => {
  test.skip(!(await supabaseRunning()), 'The local Supabase isn’t running: start it with npm run db:start in web/.');
  const email = `e2e-${Date.now()}-password@example.com`;
  await newAccount(page, email);

  // Signed in: the current password, then the new one. No email.
  await page.goto('/settings/account');
  await page.getByRole('link', { name: 'Change password' }).click();
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByLabel('New password', { exact: true }).fill('a changed password');
  await page.getByLabel('Confirm new password').fill('a changed password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  await signOut(page, email);
  await signIn(page, email, 'a changed password');
  await signOut(page, email);

  // Forgotten: a link by email, then a new password.
  await page.goto('/signin');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(page.getByText(/a link to choose a new password is on its way/)).toBeVisible();
  await page.goto(await linkInEmail(email));
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('a forgotten one, new');
  await page.getByLabel('Confirm new password').fill('a forgotten one, new');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  await signOut(page, email);
  await signIn(page, email, 'a forgotten one, new');
});

test('says when the check against bots is blocked', async ({ page }) => {
  // As an ad blocker would.
  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
  await page.goto('/signin');
  await expect(page.getByText(/The check that keeps bots out didn’t load/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
});

test('the check against bots loads and passes, so the forms can be sent', async ({ page }) => {
  await page.goto('/signin');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByText('Checking that you’re not a bot…')).toBeHidden();
});
