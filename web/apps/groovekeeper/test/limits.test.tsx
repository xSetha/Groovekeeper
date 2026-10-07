// What one account may keep (src/library/limits.ts), the same numbers as the database: songs too long to
// save, and no more than 200 songs and 20 setlists in a signed-in account.
import { parseSongText } from '@groovekeeper/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { db, type SongNote } from '../src/library/db';
import { addSongs, openSong, saveSong } from '../src/library/library';
import { createSetlist } from '../src/library/setlists';
import { accountStore } from '../src/sync/account';
import { clearToasts } from '../src/toasts';

/** A song whose verse has `lines` lines of 40 characters. */
const song = (title: string, lines = 1) =>
  parseSongText(`${title}\n\n\nKey: G\n\n[Verse 1]\n${'la la la la la la la la la la la la la l\n'.repeat(lines)}`);

const note = (text: string, i = 0): SongNote => ({ id: `n${i}`, text, column: 0, top: 0, printRow: 0 });

beforeEach(async () => {
  await Promise.all([db.songs.clear(), db.setlists.clear()]);
  accountStore.setState({ status: 'guest', userId: null, email: null });
  clearToasts();
});

afterEach(() => accountStore.setState({ status: 'guest', userId: null, email: null }));

describe('the size of a song', () => {
  it('saves a song over 20,000 characters here too, marked too long to sync, until it\'s shorter', async () => {
    const [id] = await addSongs([song('Amazing Grace')]);
    expect(await saveSong(id!, song('Amazing Grace', 450))).toBeNull(); // under 20,000 characters
    expect((await db.songs.get(id!))?.refused).toBeUndefined();

    expect(await saveSong(id!, song('Amazing Grace', 520))).toMatch(/^It has 2\d,\d{3} characters; a song can have up to 20,000\.$/);
    const stored = await db.songs.get(id!);
    expect(stored?.refused).toEqual({ reason: 'size', at: stored?.updatedAt });
    expect((await openSong(id!))?.song.sections[0]?.lines).toHaveLength(520);

    expect(await saveSong(id!, song('Amazing Grace', 400))).toBeNull();
    expect((await db.songs.get(id!))?.refused).toBeUndefined();
  });

  it('marks more than 50 notes, notes over 5,000 characters together, or a title over 500', async () => {
    const [id] = await addSongs([song('Amazing Grace')]);
    expect(await saveSong(id!, song('Amazing Grace'), Array.from({ length: 51 }, (_, i) => note('x', i)))).toBe(
      'It has 51 notes; a song can have up to 50.',
    );
    expect(await saveSong(id!, song('Amazing Grace'), [note('x'.repeat(5001))])).toMatch(/^Its notes have 5,001 characters/);
    expect(await saveSong(id!, song('x'.repeat(501)))).toMatch(/^Its title has 501 characters/);
    expect(await saveSong(id!, song('Amazing Grace'), Array.from({ length: 50 }, (_, i) => note('x'.repeat(100), i)))).toBeNull();
  });

  it('imports the songs that fit and says which file was too long', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    const long = `Long Song\n\n\nKey: G\n\n[Verse 1]\n${'la la la la la la la la la la la la la l\n'.repeat(520)}`;
    await user.upload(screen.getAllByTestId('import-files')[0]!, [
      new File([long], 'Long Song.txt'),
      new File(['Amazing Grace\n\n\nKey: G\n\n[Verse 1]\nla\n'], 'Amazing Grace.txt'),
    ]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Didn\'t import Long Song.txt');
    // The one song imported opens in the editor.
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('Amazing Grace');
    expect((await db.songs.toArray()).map((s) => s.title)).toEqual(['Amazing Grace']);
  });
});

describe('how many songs and setlists', () => {
  it('lets a signed-in account have 200 songs and says so at the 201st; a guest has no such limit', async () => {
    await addSongs(Array.from({ length: 200 }, (_, i) => song(`Song ${i}`)));
    await addSongs([song('One more as a guest')]);

    await db.songs.delete((await db.songs.where('title').equals('One more as a guest').first())!.id);
    accountStore.setState({ status: 'signedIn', userId: 'me', email: 'me@example.com' });
    await expect(addSongs([song('Song 201')])).rejects.toMatchObject({
      title: 'Your account holds up to 200 songs',
      detail: 'Delete a song to add another.',
    });
    expect(await db.songs.count()).toBe(200);
  });

  it('adds nothing when a signed-in account has room for only some of the songs', async () => {
    accountStore.setState({ status: 'signedIn', userId: 'me', email: 'me@example.com' });
    await addSongs(Array.from({ length: 198 }, (_, i) => song(`Song ${i}`)));
    await expect(addSongs([song('A'), song('B'), song('C')])).rejects.toMatchObject({
      detail: 'There\'s room for 2 more songs; delete some to add all 3.',
    });
    expect(await db.songs.count()).toBe(198);
  });

  it('lets a signed-in account have 20 setlists', async () => {
    accountStore.setState({ status: 'signedIn', userId: 'me', email: 'me@example.com' });
    for (let i = 0; i < 20; i++) await createSetlist();
    await expect(createSetlist()).rejects.toMatchObject({ title: 'Your account holds up to 20 setlists' });
  });
});
