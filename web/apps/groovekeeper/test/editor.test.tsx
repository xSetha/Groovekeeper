import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/library/db';

const TEXT = 'Amazing Grace\n\nKey: G\n\n[Verse 1]\nG          C\nAmazing grace\nhow sweet\n';

const openSong = async () => {
  await db.songs.add({ id: 'grace', title: 'Amazing Grace', artist: '', key: 'G', text: TEXT, updatedAt: 0 });
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
});
