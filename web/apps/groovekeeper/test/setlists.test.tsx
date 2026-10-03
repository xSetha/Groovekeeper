import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { db, type LibrarySetlist } from '../src/library/db';
import { deleteSong } from '../src/library/library';
import {
  addEntry, keyNote, moveEntry, removeEntry, setEntryKey, setlistSong, setlistSongs,
} from '../src/library/setlists';
import { PHONE_QUERY } from '../src/phone';

const GRACE = 'Amazing Grace\nJohn Newton\n\nKey: G\n\n[Verse 1]\nG          C\nAmazing grace\n';
const HOUSE = 'House of the Rising Sun\nTraditional\n\n[Verse]\nAm      C      D      F\nThere is a house\nAm     E     Am\nin New Orleans\n';

const setlist = (songs: LibrarySetlist['songs'] = []): LibrarySetlist => ({ id: 'gig', name: 'Friday gig', songs, updatedAt: 0, version: 0, dirty: 1 });

beforeEach(async () => {
  await db.songs.clear();
  await db.setlists.clear();
  await db.songs.bulkAdd([
    { id: 'grace', title: 'Amazing Grace', artist: 'John Newton', key: 'G', text: GRACE, updatedAt: 0, version: 0, dirty: 1 },
    { id: 'house', title: 'House of the Rising Sun', artist: 'Traditional', key: '', text: HOUSE, updatedAt: 0, version: 0, dirty: 1 },
  ]);
});

const entry = (id: string, songId: string, key = '') => ({ id, songId, key });
const songIds = (s: LibrarySetlist) => s.songs.map((e) => e.songId);

describe('setlist changes', () => {
  it('adds songs, each with its own id, so the same song can be in twice', () => {
    const s = addEntry(addEntry(setlist(), 'grace'), 'grace');
    expect(songIds(s)).toEqual(['grace', 'grace']);
    expect(s.songs[0]!.id).not.toBe(s.songs[1]!.id);
  });

  it('moves, removes songs and sets their keys by their ids', () => {
    let s = setlist([entry('1', 'grace'), entry('2', 'house'), entry('3', 'grace')]);
    s = moveEntry(s, '3', '1', 'before');
    expect(s.songs.map((e) => e.id)).toEqual(['3', '1', '2']);
    s = moveEntry(s, '3', '2', 'after');
    expect(s.songs.map((e) => e.id)).toEqual(['1', '2', '3']);
    expect(moveEntry(s, '1', 'gone', 'before')).toBe(s);
    s = setEntryKey(s, '2', 'Bm');
    expect(s.songs[1]).toEqual(entry('2', 'house', 'Bm'));
    expect(removeEntry(s, '1').songs.map((e) => e.id)).toEqual(['2', '3']);
  });

  it('moves a song past the next one shown, even with a song missing from the library in between', async () => {
    // 'lost' is no longer in the library, so the setlist shows grace, then house.
    const s = setlist([entry('1', 'grace'), entry('2', 'lost'), entry('3', 'house')]);
    const shown = await setlistSongs(s);
    expect(shown.map((song) => song.entry.id)).toEqual(['1', '3']);
    const moved = moveEntry(s, '3', shown[0]!.entry.id, 'before');
    expect((await setlistSongs(moved)).map((song) => song.title)).toEqual(['House of the Rising Sun', 'Amazing Grace']);
  });

  it('plays a song in its chosen key, or in its own (or detected) key', async () => {
    const [grace, house] = await setlistSongs(setlist([entry('1', 'grace', 'A'), entry('2', 'house')]));
    expect([grace!.key, grace!.semitones, keyNote(grace!)]).toEqual(['A', 2, '+2 from G']);
    expect([house!.originalKey, house!.key, keyNote(house!)]).toEqual(['Am', 'Am', 'original key (detected)']);
    const stored = (await db.songs.get('grace'))!;
    expect(keyNote(setlistSong(entry('1', 'grace', 'E'), stored))).toBe('−3 from G');
    expect(setlistSong(entry('1', 'grace', 'Ab'), stored).key).toBe('Ab');
  });

  it('calls a song without a title "Untitled song"', async () => {
    await db.songs.add({ id: 'blank', title: '', artist: '', key: '', text: '[Verse]\nla\n', updatedAt: 0, version: 0, dirty: 1 });
    const [blank] = await setlistSongs(setlist([entry('1', 'blank')]));
    expect(blank!.title).toBe('Untitled song');
  });

  it('loses a song from every setlist when the song is deleted', async () => {
    await db.setlists.add(setlist([entry('1', 'grace'), entry('2', 'house')]));
    await deleteSong('grace');
    expect((await db.setlists.get('gig'))?.songs).toEqual([entry('2', 'house')]);
  });
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

describe('the setlist editor', () => {
  it('keeps the keyboard on a song while it is moved with the arrows', async () => {
    const user = userEvent.setup();
    await db.setlists.add(setlist([entry('1', 'grace'), entry('2', 'house'), entry('3', 'grace')]));
    renderAt('/setlists/gig');

    const up = await screen.findAllByRole('button', { name: 'Move Amazing Grace up' });
    up[1]!.focus();
    await user.keyboard('{Enter}');

    await waitFor(async () => expect((await db.setlists.get('gig'))!.songs.map((e) => e.id)).toEqual(['1', '3', '2']));
    // Wait for the page to show the new order before looking at the keyboard.
    const order = within(screen.getByRole('list', { name: 'Songs in playing order' }));
    await waitFor(() =>
      expect(order.getAllByRole('link').map((link) => link.textContent)).toEqual([
        'Amazing Grace',
        'Amazing Grace',
        'House of the Rising Sun',
      ]));
    // The same button, now on the song's new row, still has the keyboard.
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Move Amazing Grace up');
    expect(screen.getAllByRole('button', { name: 'Move Amazing Grace up' }).indexOf(document.activeElement as HTMLElement)).toBe(1);
  });

  it('saves a name typed just before leaving the page', async () => {
    const user = userEvent.setup();
    await db.setlists.add(setlist());
    renderAt('/setlists/gig');
    const name = await screen.findByRole('textbox', { name: 'Setlist name' });
    await user.clear(name);
    await user.type(name, 'Sunday');
    // Straight away, before the save delay and without leaving the box: the browser's back button.
    window.dispatchEvent(new Event('pagehide'));

    await waitFor(async () => expect((await db.setlists.get('gig'))?.name).toBe('Sunday'), { timeout: 200 });
  });

  it('makes a setlist, adds songs, picks a key and reorders', async () => {
    const user = userEvent.setup();
    renderAt('/setlists');

    await user.click(await screen.findByRole('button', { name: 'New setlist' }));
    const name = await screen.findByRole('textbox', { name: 'Setlist name' });
    await user.clear(name);
    await user.type(name, 'Friday gig');
    await user.click(await screen.findByRole('button', { name: 'Add Amazing Grace' }));
    await user.click(screen.getByRole('button', { name: 'Add House of the Rising Sun' }));

    const order = within(screen.getByRole('list', { name: 'Songs in playing order' }));
    await waitFor(() => expect(order.getAllByRole('listitem')).toHaveLength(2));
    await user.selectOptions(order.getAllByRole('combobox')[0]!, 'A');
    expect(await order.findByText('+2 from G')).toBeInTheDocument();
    await user.click(order.getByRole('button', { name: 'Move House of the Rising Sun up' }));

    await waitFor(async () => {
      const stored = (await db.setlists.toArray())[0]!;
      expect(stored.name).toBe('Friday gig');
      expect(stored.songs.map(({ songId, key }) => ({ songId, key }))).toEqual([
        { songId: 'house', key: '' },
        { songId: 'grace', key: 'A' },
      ]);
    });
  });

  it('deletes a setlist after asking, keeping its songs', async () => {
    const user = userEvent.setup();
    await db.setlists.add(setlist([entry('1', 'grace')]));
    renderAt('/setlists/gig');

    await user.click(await screen.findByRole('button', { name: 'Delete setlist' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(async () => expect(await db.setlists.count()).toBe(0));
    expect(await db.songs.count()).toBe(2);
  });
});

describe('a setlist on a phone', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === PHONE_QUERY,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('plays the songs in order, each in its setlist key', async () => {
    const user = userEvent.setup();
    await db.setlists.add(setlist([entry('1', 'grace', 'A'), entry('2', 'house', 'Bm')]));
    renderAt('/setlists/gig');

    expect(screen.queryByRole('button', { name: 'New setlist' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('link', { name: /Amazing Grace/ }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Amazing Grace' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByTestId('song-key')).toHaveTextContent('A');
    // G and C, moved up two, are A and D; D appears nowhere else on the page.
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.queryByText('C')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Next song' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'House of the Rising Sun' })).toBeInTheDocument();
    expect(screen.getByTestId('song-key')).toHaveTextContent('Bm');
    expect(screen.queryByRole('link', { name: 'Next song' })).not.toBeInTheDocument();
  });
});
