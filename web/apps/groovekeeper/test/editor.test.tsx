import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  it('shows a song as stored, without sections when it has none', async () => {
    await db.songs.add({ id: 'bare', title: 'Bare', artist: '', key: '', text: 'Bare\n', updatedAt: 0, version: 0, dirty: 1 });
    render(
      <MemoryRouter initialEntries={['/songs/bare']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: '+ Section' })).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox', { name: 'Section name' })).toEqual([]);
  });

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

  it('moves a section dragged by its grip to where it is dropped, as one undo step', async () => {
    const user = userEvent.setup();
    await openSong();
    const sectionNames = () => screen.getAllByRole('textbox', { name: 'Section name' }).map((box) => (box as HTMLInputElement).value);
    await user.click(screen.getByRole('button', { name: 'Duplicate section' }));
    await user.click(screen.getAllByRole('button', { name: 'Duplicate section' })[1]!);
    const names = screen.getAllByRole('textbox', { name: 'Section name' });
    for (const [i, name] of ['Intro', 'Verse', 'Chorus'].entries()) {
      await user.clear(names[i]!);
      await user.type(names[i]!, name);
    }
    // The test DOM has no layout: the sections stand 100px apart, each 80px tall.
    document.querySelectorAll('[data-sections] > section').forEach((section, i) => {
      section.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: i * 100, width: 500, height: 80 });
    });

    const grip = screen.getAllByRole('button', { name: 'Drag section to another place' })[0]!;
    fireEvent.pointerDown(grip, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 0, clientY: 160 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 0, clientY: 250 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 0, clientY: 250 });
    expect(sectionNames()).toEqual(['Verse', 'Chorus', 'Intro']);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(sectionNames()).toEqual(['Intro', 'Verse', 'Chorus']);
  });

  it('adds a section after the one with the caret, or at the end from the title', async () => {
    const user = userEvent.setup();
    await openSong();
    const sectionNames = () => screen.getAllByRole('textbox', { name: 'Section name' }).map((box) => (box as HTMLInputElement).value);
    await user.click(screen.getByRole('button', { name: 'Duplicate section' }));
    await user.clear(screen.getAllByRole('textbox', { name: 'Section name' })[1]!);
    await user.type(screen.getAllByRole('textbox', { name: 'Section name' })[1]!, 'Chorus');

    await user.click(screen.getAllByRole('textbox', { name: 'Lyrics' })[0]!);
    await user.click(screen.getByRole('button', { name: '+ Section' }));
    expect(sectionNames()).toEqual(['Verse 1', 'New section', 'Chorus']);
    // The caret goes into the new section's line.
    expect(screen.getAllByRole('textbox', { name: 'Lyrics' })[2]).toHaveFocus();

    await user.click(screen.getByRole('textbox', { name: 'Title' }));
    await user.click(screen.getByRole('button', { name: '+ Section' }));
    expect(sectionNames()).toEqual(['Verse 1', 'New section', 'Chorus', 'New section']);
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

describe('notes', () => {
  const storedNotes = async () => (await db.songs.get('grace'))?.notes ?? [];

  it('adds a note where the song is right-clicked, typed into and finished with Enter', async () => {
    const user = userEvent.setup();
    await openSong();
    fireEvent.contextMenu(screen.getAllByTestId('chord-row')[1]!, { clientX: 0, clientY: 0 });
    await user.click(screen.getByRole('menuitem', { name: 'Add note here' }));

    const note = screen.getByRole('textbox', { name: 'Note' });
    expect(note).toHaveFocus();
    await user.keyboard('Capo 2{Shift>}{Enter}{/Shift}build up{Enter}');
    expect(note).not.toHaveFocus();
    await waitFor(async () => expect((await storedNotes()).map((n) => n.text)).toEqual(['Capo 2\nbuild up']));
    // The note isn't part of the song's text.
    expect(await stored()).toBe(TEXT);
  });

  it('keeps the browser’s own menu on the lyrics', async () => {
    const [first] = await openSong();
    fireEvent.contextMenu(first!);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('removes a note left empty, deletes one with its button, and undoes that', async () => {
    const user = userEvent.setup();
    await openSong();
    fireEvent.contextMenu(screen.getAllByTestId('chord-row')[0]!);
    await user.click(screen.getByRole('menuitem', { name: 'Add note here' }));
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('textbox', { name: 'Note' })).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getAllByTestId('chord-row')[0]!);
    await user.click(screen.getByRole('menuitem', { name: 'Add note here' }));
    await user.keyboard('Slow{Enter}');
    await user.click(screen.getByRole('button', { name: 'Delete note' }));
    expect(screen.queryByRole('textbox', { name: 'Note' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('Slow');
  });

  it('opens with the song’s notes, and deletes one from its own menu', async () => {
    await db.songs.add({
      id: 'grace', title: 'Amazing Grace', artist: '', key: 'G', text: TEXT, updatedAt: 0, version: 0, dirty: 1,
      notes: [{ id: 'n1', text: 'Capo 2', column: 3, top: 10, printRow: 0.2 }],
    });
    render(
      <MemoryRouter initialEntries={['/songs/grace']}>
        <App />
      </MemoryRouter>,
    );
    const note = await screen.findByRole('textbox', { name: 'Note' });
    expect(note).toHaveValue('Capo 2');
    expect(note.parentElement?.style.left).toBe('calc(3ch + 0px)');

    const user = userEvent.setup();
    fireEvent.contextMenu(note.parentElement!);
    await user.click(screen.getByRole('menuitem', { name: 'Delete note' }));
    await waitFor(async () => expect(await storedNotes()).toEqual([]));
  });

  it('says a saved song file leaves the notes out', async () => {
    const user = userEvent.setup();
    await openSong();
    fireEvent.contextMenu(screen.getAllByTestId('chord-row')[0]!);
    await user.click(screen.getByRole('menuitem', { name: 'Add note here' }));
    await user.keyboard('Capo 2{Enter}');
    URL.createObjectURL = () => 'blob:song';
    URL.revokeObjectURL = () => {};
    // The save button opens and closes its menu.
    await user.click(screen.getByRole('button', { name: 'Save as file' }));
    await user.click(screen.getByRole('button', { name: 'Save as file' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save as file' }));
    await user.click(screen.getByRole('menuitem', { name: 'Save as .txt' }));
    expect(screen.getByRole('status')).toHaveTextContent('Its notes stay in the library');
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
