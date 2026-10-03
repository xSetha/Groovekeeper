// Typing in a line must re-render that line only, not the whole song: re-rendering every line on every key
// makes typing lag on a long song or a phone.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/library/db';
import { renders } from './react-renders';

const TEXT = 'Song\n\n[Verse 1]\nla\nla\nla\nla\n\n[Chorus]\nla\nla\nla\nla\n';

beforeEach(() => db.songs.clear());

describe('typing', () => {
  it('re-renders only the line typed in', async () => {
    await db.songs.add({ id: 'song', title: 'Song', artist: '', key: '', text: TEXT, updatedAt: 0, version: 0, dirty: 1 });
    render(
      <MemoryRouter initialEntries={['/songs/song']}>
        <App />
      </MemoryRouter>,
    );
    const [first] = await screen.findAllByRole('textbox', { name: 'Lyrics' });
    const user = userEvent.setup();
    await user.click(first!);

    renders.clear();
    await user.keyboard('{End}la la');

    // Five keys, the typed-in line once each; the other seven lines, the sections and the editor didn't run.
    expect(renders.get('EditorLine')).toBe(5);
    expect(renders.get('SectionBlock')).toBeUndefined();
    expect(renders.get('EditorBody')).toBeUndefined();
  });
});
