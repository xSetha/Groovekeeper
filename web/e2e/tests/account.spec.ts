// The account forms in a real browser, with Cloudflare's Turnstile check (its test key, which passes) and the
// local Supabase checking each token. Needs the local Supabase (`npm run db:start` in web/).
import { expect, test } from './csp';
import { linkInEmail, supabaseRunning } from './supabase';

const PASSWORD = 'correct horse battery';

test('a new account confirms its email, and signs in after a wrong password with a new check', async ({ page }) => {
  test.skip(!(await supabaseRunning()), 'The local Supabase isn’t running: start it with npm run db:start in web/.');
  const email = `e2e-${Date.now()}-account@example.com`;

  await page.goto('/account');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  await page.goto(await linkInEmail(email));
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();

  await page.goto('/account');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByLabel('Password').fill('not the password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');
  // A token works once: the second try gets a new one.
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
});

test('says when the check against bots is blocked', async ({ page }) => {
  // As an ad blocker would.
  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
  await page.goto('/account');
  await expect(page.getByText(/The check that keeps bots out didn’t load/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
});

test('the check against bots loads and passes, so the forms can be sent', async ({ page }) => {
  await page.goto('/account');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByText('Checking that you’re not a bot…')).toBeHidden();
});
