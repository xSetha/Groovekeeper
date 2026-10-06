import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/library/db';

const TEXT = 'Amazing Grace\n\nKey: G\n\n[Verse 1]\nG          C\nAmazing grace\nhow sweet\n';

const openSong = async () => {
  await db.songs.add({ id: 'grace', title: 'Amazing Grace', artist: '', key: 'G', text: TEXT, updatedAt: 0, version: 0, dirty: 1 });
  render(
    <MemoryRouter initialEntries={['/songs/grace']}>
      <App />
    </MemoryRouter>,
  );
  return screen.findAllByRole('textbox', { name: 'Lyrics' });
};

const sheet = () => within(screen.getByRole('article', { name: 'Song' }));

const stored = async () => (await db.songs.get('grace'))?.text;

beforeEach(() => db.songs.clear());

describe('the editor', () => {
  it('keeps chords on their letters while typing, and saves', async () => {
    const user = userEvent.setup();
    const [first] = await openSong();

    // Type a comma after "Amazing": the C over "grace" moves one letter right.
    await user.click(first!);
    await user.keyboard('{Home}{ArrowRight>7/}{/ArrowRight},');

    expect(first).toHaveValue('Amazing, grace');
    expect(sheet().getByRole('button', { name: 'C' }).parentElement?.style.left).toBe('12ch');
    await waitFor(async () => expect(await stored()).toContain('G           C\nAmazing, grace\n'));
  });

  it('splits a line with Enter and joins it back with Backspace', async () => {
    const user = userEvent.setup();
    const [first] = await openSong();

    await user.click(first!);
    await user.keyboard('{Home}{ArrowRight>8/}{Enter}');

    let lines = screen.getAllByRole('textbox', { name: 'Lyrics' });
    expect(lines.map((l) => (l as HTMLInputElement).value)).toEqual(['Amazing ', 'grace', 'how sweet']);
    expect(lines[1]).toHaveFocus();

    await user.keyboard('{Backspace}');

    lines = screen.getAllByRole('textbox', { name: 'Lyrics' });
    expect(lines.map((l) => (l as HTMLInputElement).value)).toEqual(['Amazing grace', 'how sweet']);
    expect(lines[0]).toHaveFocus();
    expect((lines[0] as HTMLInputElement).selectionStart).toBe(8);
  });

  it('moves between lines with the arrow keys', async () => {
    const user = userEvent.setup();
    const [first, second] = await openSong();

    await user.click(first!);
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
  });

  it('removes a chord by tapping it, then Remove (no right-click on a phone)', async () => {
    const user = userEvent.setup();
    await openSong();

    await user.click(sheet().getByRole('button', { name: 'G' }));
    await user.click(sheet().getByRole('button', { name: 'Remove' }));

    expect(sheet().queryByRole('button', { name: 'G' })).not.toBeInTheDocument();
    expect(sheet().queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('saves straight away when the app is hidden', async () => {
    const user = userEvent.setup();
    const [first] = await openSong();
    await user.click(first!);
    await user.keyboard('{End}!');

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

    // Well before the 400 ms autosave delay.
    await waitFor(async () => expect(await stored()).toContain('Amazing grace!\n'), { timeout: 150 });
  });

  it('removes a chord with right-click', async () => {
    const user = userEvent.setup();
    await openSong();

    await user.pointer({ keys: '[MouseRight]', target: sheet().getByRole('button', { name: 'G' }) });

    expect(sheet().queryByRole('button', { name: 'G' })).not.toBeInTheDocument();
    await waitFor(async () => expect(await stored()).toContain('[Verse 1]\n           C\nAmazing grace\n'));
  });

  it('undoes typing with Ctrl+Z, a word at a time, and redoes it', async () => {
    const user = userEvent.setup();
    const [first] = await openSong();
    await user.click(first!);
    await user.keyboard('{End} how sweet');

    await user.keyboard('{Control>}z{/Control}');
    expect(first).toHaveValue('Amazing grace how ');
    await user.keyboard('{Control>}z{/Control}');
    expect(first).toHaveValue('Amazing grace ');
    await user.keyboard('{Control>}y{/Control}');
    expect(first).toHaveValue('Amazing grace how ');
  });

  it('moves, duplicates, repeats and deletes sections, and undoes them', async () => {
    const user = userEvent.setup();
    await openSong();
    const sectionNames = () => screen.getAllByRole('textbox', { name: 'Section name' }).map((box) => (box as HTMLInputElement).value);

    await user.click(screen.getByRole('button', { name: 'Duplicate section' }));
    expect(sectionNames()).toEqual(['Verse 1', 'Verse 1']);
    await user.clear(screen.getAllByRole('textbox', { name: 'Section name' })[1]!);
    await user.type(screen.getAllByRole('textbox', { name: 'Section name' })[1]!, 'Chorus');
    await user.click(screen.getAllByRole('button', { name: 'Move section up' })[1]!);
    expect(sectionNames()).toEqual(['Chorus', 'Verse 1']);
    await user.click(screen.getAllByRole('button', { name: 'Repeat section at the end' })[0]!);
    expect(screen.getByRole('region', { name: 'Repeat of Chorus' })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Delete section' })[0]!);
    expect(sectionNames()).toEqual(['Verse 1']);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(sectionNames()).toEqual(['Chorus', 'Verse 1']);
  });

  it('pastes a whole song: chord rows go above their lyrics and [Name] rows start sections', async () => {
    const user = userEvent.setup();
    const [, second] = await openSong();
    await user.click(second!);
    await user.keyboard('{End}');

    await user.paste('\n[Chorus]\nD       G\nthe sound');

    expect(screen.getAllByRole('textbox', { name: 'Section name' }).map((b) => (b as HTMLInputElement).value)).toEqual([
      'Verse 1',
      'Chorus',
    ]);
    const chorus = within(screen.getByRole('region', { name: 'Chorus' }));
    expect(chorus.getByRole('textbox', { name: 'Lyrics' })).toHaveValue('the sound');
    expect(chorus.getByRole('button', { name: 'G' }).parentElement?.style.left).toBe('8ch');
  });

  it('edits the title, artist and key', async () => {
    const user = userEvent.setup();
    await openSong();

    await user.type(screen.getByRole('textbox', { name: 'Artist' }), 'John Newton');
    await user.selectOptions(screen.getByTestId('song-key'), 'A');

    await waitFor(async () => expect(await stored()).toMatch(/^Amazing Grace\nJohn Newton\n\nKey: A\n/));
  });
});

describe('typing chords', () => {
  // In the test DOM nothing has a size, so a click on a chord row is over its first letter.
  const chordRow = (line: number) => screen.getAllByTestId('chord-row')[line]!;
  const chordBox = () => screen.getByRole('textbox', { name: 'Chord' });

  it('types a chord above a letter with a click on the chord row and Enter', async () => {
    const user = userEvent.setup();
    const lines = await openSong();
    await user.click(chordRow(1));
    await user.keyboard('Em7{Enter}');

    expect(sheet().getByRole('button', { name: 'Em7' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Chord' })).not.toBeInTheDocument();
    expect(lines[1]).toHaveFocus();
    await waitFor(async () => expect(await stored()).toContain('Amazing grace\nEm7\nhow sweet\n'));
  });

  it("refuses what isn't a chord, and Esc cancels", async () => {
    const user = userEvent.setup();
    await openSong();
    await user.click(chordRow(1));
    await user.keyboard('hello{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent('Not a chord');
    expect(chordBox()).toHaveValue('hello');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Chord' })).not.toBeInTheDocument();
    expect(await stored()).toBe(TEXT);
  });

  it('changes a chord with a double-click, and an empty name removes it', async () => {
    const user = userEvent.setup();
    await openSong();
    await user.dblClick(sheet().getByRole('button', { name: 'C' }));
    expect(chordBox()).toHaveValue('C');
    await user.clear(chordBox());
    await user.keyboard('Cmaj7{Enter}');
    expect(sheet().getByRole('button', { name: 'Cmaj7' })).toBeInTheDocument();

    await user.dblClick(sheet().getByRole('button', { name: 'G' }));
    await user.clear(chordBox());
    await user.keyboard('{Enter}');
    expect(sheet().queryByRole('button', { name: 'G' })).not.toBeInTheDocument();
    await waitFor(async () => expect(await stored()).toContain('           Cmaj7\nAmazing grace\n'));
  });

  it('keeps a typed chord when clicking away, and drops anything else', async () => {
    const user = userEvent.setup();
    await openSong();
    await user.click(chordRow(1));
    await user.keyboard('D');
    await user.click(screen.getByRole('textbox', { name: 'Title' }));
    expect(sheet().getByRole('button', { name: 'D' })).toBeInTheDocument();

    await user.click(chordRow(1));
    await user.clear(chordBox());
    await user.keyboard('xyz');
    await user.click(screen.getByRole('textbox', { name: 'Title' }));
    expect(screen.queryByRole('textbox', { name: 'Chord' })).not.toBeInTheDocument();
    expect(sheet().getByRole('button', { name: 'D' })).toBeInTheDocument();
  });

  it('is one undo step per chord', async () => {
    const user = userEvent.setup();
    await openSong();
    await user.click(chordRow(1));
    await user.keyboard('Am{Enter}');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(sheet().queryByRole('button', { name: 'Am' })).not.toBeInTheDocument();
    expect(sheet().getByRole('button', { name: 'C' })).toBeInTheDocument();
  });

  it('shows the song\'s chords as Roman numerals with I IV V, without changing them', async () => {
    const user = userEvent.setup();
    await openSong();
    await user.click(screen.getByRole('button', { name: 'I IV V' }));

    expect(sheet().getByRole('button', { name: 'I' })).toBeInTheDocument();
    expect(sheet().getByRole('button', { name: 'IV' })).toBeInTheDocument();
    expect(await stored()).toBe(TEXT);
  });

  it('no longer offers a key from the chords', async () => {
    await openSong();
    expect(screen.queryByText(/The chords suggest/)).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Chords' })).not.toBeInTheDocument();
  });
});

describe('new songs', () => {
  const renderStart = () =>
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

  it('opens a new song in the editor, and removes it again if it was left empty', async () => {
    const user = userEvent.setup();
    renderStart();

    await user.click(await screen.findByRole('button', { name: 'New song' }));
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('');
    expect(screen.getAllByRole('textbox', { name: 'Section name' }).map((b) => (b as HTMLInputElement).value)).toEqual([
      'Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Bridge', 'Outro',
    ]);
    expect(screen.getAllByRole('textbox', { name: 'Lyrics' })).toHaveLength(6);
    expect(await db.songs.count()).toBe(1);

    await user.click(screen.getByRole('link', { name: 'Groovekeeper' }));
    await waitFor(async () => expect(await db.songs.count()).toBe(0));
  });

  it('keeps a new song that was written in', async () => {
    const user = userEvent.setup();
    renderStart();

    await user.click(await screen.findByRole('button', { name: 'New song' }));
    await user.type(await screen.findByRole('textbox', { name: 'Title' }), 'My song');
    await user.click(screen.getByRole('link', { name: 'Groovekeeper' }));

    await waitFor(async () => expect((await db.songs.toArray()).map((s) => s.title)).toEqual(['My song']));
  });

  it('starts a new song from beside the editor, keeping the one that was open', async () => {
    const user = userEvent.setup();
    await openSong();
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue('Amazing Grace');

    await user.click(screen.getByRole('button', { name: '+ New song' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(''));
    expect((await db.songs.toArray()).map((s) => s.title).toSorted()).toEqual(['', 'Amazing Grace']);
  });
});
