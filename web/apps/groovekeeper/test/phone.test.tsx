import { parseSongText } from '@groovekeeper/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { setChordNaming } from '../src/chordNaming';
import { songColumns } from '../src/components/SongSheet';
import { db } from '../src/library/db';
import { PHONE_QUERY } from '../src/phone';

const TEXT = 'Amazing Grace\nJohn Newton\n\nKey: G\n\n[Verse 1]\nG          C\nAmazing grace\n';

const renderApp = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

beforeEach(async () => {
  await db.songs.clear();
  // The app asks whether it runs on a phone; here it does.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === PHONE_QUERY,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  setChordNaming('letters');
});

describe('on a phone', () => {
  it('a song shows its notes, read only', async () => {
    await db.songs.add({
      id: 'grace', title: 'Amazing Grace', artist: 'John Newton', key: 'G', text: TEXT, updatedAt: 0, version: 0, dirty: 1,
      notes: [{ id: 'n1', text: 'Capo 2', column: 4, top: 0, printRow: 0 }],
    });
    renderApp('/songs/grace');

    const note = await screen.findByText('Capo 2');
    expect(note.parentElement?.style.left).toBe('4ch');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('the start page is the library, without importing', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('button', { name: 'Try the sample songs' }));

    expect(await screen.findByText('Amazing Grace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import songs/ })).not.toBeInTheDocument();
  });

  it('a song is read, not edited, and transposing doesn\'t change it', async () => {
    const user = userEvent.setup();
    await db.songs.add({ id: 'grace', title: 'Amazing Grace', artist: 'John Newton', key: 'G', text: TEXT, updatedAt: 0, version: 0, dirty: 1 });
    renderApp('/songs/grace');

    expect(await screen.findByRole('heading', { level: 1, name: 'Amazing Grace' })).toBeInTheDocument();
    expect(screen.getByText('Amazing grace')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Transpose up' }));
    await user.click(screen.getByRole('button', { name: 'Transpose up' }));

    expect(screen.getByTestId('song-key')).toHaveTextContent('A');
    expect(screen.getByText('D')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to G' }));
    expect(screen.getByTestId('song-key')).toHaveTextContent('G');
    // Nothing was saved.
    await waitFor(async () => expect((await db.songs.get('grace'))?.text).toBe(TEXT));
  });
});

describe('Do Re Mi on a phone', () => {
  it('writes the chords and the key in the reader the way the editor does', async () => {
    const user = userEvent.setup();
    await db.songs.add({ id: 'grace', title: 'Amazing Grace', artist: 'John Newton', key: 'G', text: TEXT, updatedAt: 0, version: 0, dirty: 1 });
    setChordNaming('solfege');
    renderApp('/songs/grace');

    expect((await screen.findAllByText('Sol')).length).toBeGreaterThan(1); // the chord and the key
    expect(screen.getByTestId('song-key')).toHaveTextContent('Sol');
    await user.click(screen.getByRole('button', { name: 'Transpose up' }));
    expect(screen.getByTestId('song-key')).toHaveTextContent('Lab'); // G up one is Ab
    expect(screen.getByRole('button', { name: 'Back to Sol' })).toBeInTheDocument();
  });

  it('shows the key chip in the library and a setlist in Do Re Mi', async () => {
    await db.songs.add({ id: 'grace', title: 'Amazing Grace', artist: 'John Newton', key: 'G', text: TEXT, updatedAt: 0, version: 0, dirty: 1 });
    setChordNaming('solfege');
    renderApp('/');

    expect(await screen.findByText('Amazing Grace')).toBeInTheDocument();
    expect(screen.getByTitle('Key of Sol')).toHaveTextContent('Sol');
  });
});

describe('fitting a song to the screen', () => {
  it('counts the columns of the widest line, chords past the lyrics included', () => {
    expect(songColumns(parseSongText(TEXT))).toBe(13);
    expect(songColumns(parseSongText('[Intro]\nC   G   Am   Fmaj7\n'))).toBe(18);
  });

  it('counts the chords as they are written in Do Re Mi, which are wider', () => {
    // Fmaj7 starts at column 13 and becomes Famaj7, one letter wider.
    expect(songColumns(parseSongText('[Intro]\nC   G   Am   Fmaj7\n'), 'solfege')).toBe(19);
  });
});
