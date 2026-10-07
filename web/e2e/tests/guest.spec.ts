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
