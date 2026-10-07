// A guest's library, no account: it lives in the browser and is still there after a reload, and a song
// exports as a PDF.
import { expect, test } from './csp';

test('a guest\'s songs and changes stay in the browser', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the sample songs' }).click();
  const library = page.getByRole('navigation', { name: 'Library' });
  await expect(library.getByText('Scarborough Fair')).toBeVisible();

  await library.getByRole('link', { name: /Oh! Susanna/ }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Oh! Susanna (live)');
  // Leaving the song saves it straight away.
  await page.getByRole('link', { name: 'Songs' }).click();

  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Library' }).getByText('Oh! Susanna (live)')).toBeVisible();

  await page.getByRole('navigation', { name: 'Library' }).getByRole('link', { name: /Oh! Susanna/ }).click();
  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect(page.getByRole('heading', { name: 'Export PDF' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
});

test('the built app opens without a connection once it has been opened', async ({ page }) => {
  test.skip(test.info().project.name !== 'built', 'The dev server has no service worker.');
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the sample songs' }).click();
  await expect(page.getByRole('navigation', { name: 'Library' }).getByText('Scarborough Fair')).toBeVisible();
  // The service worker has kept the app once it's ready.
  await page.evaluate(() => navigator.serviceWorker.ready);

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Library' }).getByText('Scarborough Fair')).toBeVisible();
  await page.getByRole('link', { name: 'Setlists' }).click();
  await expect(page.getByRole('heading', { name: 'Setlists' })).toBeVisible();
});
