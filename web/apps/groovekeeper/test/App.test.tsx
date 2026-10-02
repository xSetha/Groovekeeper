import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/library/db';

const AMAZING_GRACE = 'Amazing Grace\nJohn Newton\n\nKey: G\n\n[Verse 1]\n G                 G7        C\nAmazing grace, how sweet the sound\n\n[Verse 1]\n(Repeat)\n';

const renderApp = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

beforeEach(() => db.songs.clear());

describe('the app', () => {
  it('imports a song file, opens it and transposes it', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.upload(screen.getAllByTestId('import-files')[0]!, new File([AMAZING_GRACE], 'Amazing Grace.txt'));

    // One song imported: it opens.
    expect(await screen.findByRole('heading', { level: 1, name: 'Amazing Grace' })).toBeInTheDocument();
    expect(screen.getByText('(repeat)')).toBeInTheDocument();
    const sheet = within(screen.getByRole('article', { name: 'Song' }));
    expect(sheet.getByText('G7').parentElement?.style.left).toBe('19ch');
    expect(screen.getByTestId('song-key')).toHaveTextContent('G');

    await user.click(screen.getByRole('button', { name: 'Transpose up' }));

    await waitFor(() => expect(screen.getByTestId('song-key')).toHaveTextContent('Ab'));
    expect(sheet.getByText('Ab7')).toBeInTheDocument();
    const library = screen.getByRole('navigation', { name: 'Library' });
    expect(await within(library).findByText('John Newton · Ab')).toBeInTheDocument();
  });

  it('adds the sample songs to an empty library', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Try the sample songs' }));

    expect(await screen.findByText('Twinkle, Twinkle, Little Star')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try the sample songs' })).not.toBeInTheDocument());
  });

  it('searches the library', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Try the sample songs' }));
    await screen.findByText('Amazing Grace');

    await user.type(screen.getByRole('searchbox', { name: 'Search the library' }), 'am');

    // "Am" matches the key of two songs, "am" the title of one.
    const library = screen.getByRole('navigation', { name: 'Library' });
    expect(within(library).getAllByRole('link').map((link) => link.querySelector('span')?.textContent)).toEqual([
      'Amazing Grace',
      'House of the Rising Sun',
      'Scarborough Fair',
    ]);
  });

  it('deletes a song after asking', async () => {
    const user = userEvent.setup();
    await db.songs.add({ id: 'grace', title: 'Amazing Grace', artist: '', key: 'G', text: AMAZING_GRACE, updatedAt: 0 });
    renderApp('/songs/grace');

    await user.click(await screen.findByRole('button', { name: 'Delete song' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete “Amazing Grace”?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('button', { name: 'Try the sample songs' })).toBeInTheDocument();
    expect(await db.songs.count()).toBe(0);
  });

  it('says when a song is missing', async () => {
    renderApp('/songs/nothing');
    expect(await screen.findByText("This song isn't in your library.")).toBeInTheDocument();
  });
});
