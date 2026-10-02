import { parseSongText } from '@groovekeeper/core';
import { describe, expect, it } from 'vitest';
import { editText, setTitle, withIds } from '../src/editor/edit';
import { createEditorStore } from '../src/editor/store';

const at = { section: 0, line: 0 };
const newStore = () => createEditorStore(withIds(parseSongText('[Verse]\nla\n')));
const lyric = (store: ReturnType<typeof newStore>) => store.getState().song.sections[0]!.lines[0]!.text;

describe('undo and redo', () => {
  it('undoes and redoes an edit', () => {
    const store = newStore();
    store.getState().edit((s) => setTitle(s, 'Song'));
    store.getState().undo();
    expect(store.getState().song.title).toBe('');
    store.getState().redo();
    expect(store.getState().song.title).toBe('Song');
  });

  it('makes typing in one line one step per word', () => {
    const store = newStore();
    const type = (text: string, endStep = false) =>
      store.getState().edit((s) => editText(s, at, text, text.length), { merge: 'type:line', endStep });
    type('la d');
    type('la di', false);
    type('la di ', true);
    type('la di d');
    type('la di da');
    expect(store.getState().past).toHaveLength(2);
    store.getState().undo();
    expect(lyric(store)).toBe('la di ');
    store.getState().undo();
    expect(lyric(store)).toBe('la');
  });

  it('a new edit clears what could be redone', () => {
    const store = newStore();
    store.getState().edit((s) => setTitle(s, 'One'));
    store.getState().undo();
    store.getState().edit((s) => setTitle(s, 'Two'));
    expect(store.getState().future).toEqual([]);
  });

  it('ignores edits that change nothing', () => {
    const store = newStore();
    store.getState().edit((s) => s);
    expect(store.getState().past).toEqual([]);
  });
});
