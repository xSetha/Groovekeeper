import { getDefaultNormalizer, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/library/db';

const GRACE =
  'Amazing Grace\nJohn Newton\n\nKey: G\n\n[Chorus]\nG          C\nAmazing grace\n\n[Verse]\nD\nhow sweet\n\n' +
  '[Chorus]\nG          C\nAmazing grace\n';
const HOUSE = 'House of the Rising Sun\nTraditional\n\n[Verse]\nAm      C      D      F\nThere is a house\nAm     E     Am\nin New Orleans\n';

beforeEach(async () => {
  await db.songs.clear();
  await db.setlists.clear();
  await db.songs.bulkAdd([
    { id: 'grace', title: 'Amazing Grace', artist: 'John Newton', key: 'G', text: GRACE, updatedAt: 0 },
    { id: 'house', title: 'House of the Rising Sun', artist: 'Traditional', key: '', text: HOUSE, updatedAt: 0 },
  ]);
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

const pages = () => within(screen.getByRole('main', { name: 'Pages to print' }));
// Chord rows are matched with their spaces, which place each chord over its letter.
const asWritten = { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) };

describe('printing', () => {
  it('prints one song, with a section that repeats an earlier one collapsed', async () => {
    const user = userEvent.setup();
    renderAt('/print?song=grace');

    expect(await screen.findByRole('heading', { name: 'Amazing Grace' })).toBeInTheDocument();
    expect(pages().getByText('Key: G')).toBeInTheDocument();
    expect(pages().getAllByText('Amazing grace')).toHaveLength(1);
    expect(pages().getByText('(repeat)')).toBeInTheDocument();
    expect(document.title).toBe('Amazing Grace');

    await user.click(screen.getByRole('checkbox', { name: /Collapse repeated sections/ }));
    expect(pages().getAllByText('Amazing grace')).toHaveLength(2);
    expect(pages().queryByText('(repeat)')).toBeNull();

    // The chord row keeps its columns; as numerals in G.
    expect(pages().getAllByText('G          C', asWritten)).toHaveLength(2);
    await user.click(screen.getByRole('checkbox', { name: /Chords as Roman numerals/ }));
    expect(pages().getAllByText('I          IV', asWritten)).toHaveLength(2);
  });

  it('prints a setlist with each song in its key, noting a changed key', async () => {
    await db.setlists.add({
      id: 'gig', name: 'Friday gig', updatedAt: 0,
      songs: [{ id: '1', songId: 'grace', key: 'A' }, { id: '2', songId: 'house', key: '' }],
    });
    renderAt('/print?setlist=gig');

    expect(await screen.findByText('[Key of A (+2 semitones from the original)]')).toBeInTheDocument();
    expect(pages().getByText('Key: A')).toBeInTheDocument();
    expect(pages().getAllByText('A          D', asWritten)).toHaveLength(1);
    // Played as written, in the key its chords point to.
    expect(pages().getByText('Key: Am')).toBeInTheDocument();
    expect(pages().getAllByRole('article')).toHaveLength(2);
    expect(document.title).toBe('Friday gig');
  });

  it('prints the songs ticked in the library as a songbook', async () => {
    const user = userEvent.setup();
    renderAt('/print');

    const house = await screen.findByRole('checkbox', { name: /House of the Rising Sun/ });
    expect(pages().getByText('Tick the songs to print.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print…' })).toBeDisabled();

    await user.click(house);
    expect(pages().getAllByRole('article')).toHaveLength(1);
    expect(pages().getByRole('heading', { name: 'House of the Rising Sun' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print…' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Tick all' }));
    expect(pages().getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Amazing Grace',
      'House of the Rising Sun',
    ]);
  });

  it('is opened from the editor, with the way back to the song', async () => {
    const user = userEvent.setup();
    renderAt('/songs/grace');
    expect(await screen.findByRole('link', { name: 'Print songs…' })).toHaveAttribute('href', '/print');
    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(await screen.findByRole('heading', { name: 'Print' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Amazing Grace' })).toHaveAttribute('href', '/songs/grace');
  });
});
