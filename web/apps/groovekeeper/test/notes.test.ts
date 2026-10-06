import { parseSongText } from '@groovekeeper/core';
import { describe, expect, it } from 'vitest';
import { rowAt, topAt } from '../src/components/notes';
import { addNote, deleteNote, finishNote, moveNote, setNoteText, withIds, withPrintRows } from '../src/editor/edit';

// Three lines, 40px apart and 30px tall.
const LINES = [
  { top: 100, height: 30 },
  { top: 140, height: 30 },
  { top: 180, height: 30 },
];

describe('where a note floats', () => {
  it('is the line it is on, and how far towards the next', () => {
    expect(rowAt(LINES, 100)).toBe(0);
    expect(rowAt(LINES, 120)).toBe(0.5);
    expect(rowAt(LINES, 150)).toBe(1.25);
  });

  it('counts on in the first or last line’s height above or below the song', () => {
    expect(rowAt(LINES, 85)).toBe(-0.5);
    expect(rowAt(LINES, 240)).toBe(4);
    expect(rowAt([], 50)).toBe(0);
  });

  it('finds the same spot again on lines laid out at another size', () => {
    const bigger = LINES.map((line) => ({ top: line.top * 2, height: line.height * 2 }));
    for (const top of [85, 100, 120, 150, 240]) expect(topAt(bigger, rowAt(LINES, top))).toBe(top * 2);
  });
});

describe('notes in the editor', () => {
  const SONG = withIds(parseSongText('[Verse]\nla la\n'));

  it('adds an empty note at a spot, and removes it again when it’s left empty', () => {
    const { song, id } = addNote(SONG, 4.5, 30);
    expect(song.notes).toEqual([{ id, text: '', column: 4.5, top: 30, printRow: 0 }]);
    expect(finishNote(song, id).notes).toEqual([]);
    const typed = setNoteText(song, id, 'Capo 2');
    expect(finishNote(typed, id)).toBe(typed);
  });

  it('moves and deletes a note, never above or left of the song', () => {
    const { song, id } = addNote(SONG, 1, 10);
    expect(moveNote(song, id, -3, -20).notes[0]).toMatchObject({ column: 0, top: 0 });
    expect(deleteNote(song, id).notes).toEqual([]);
    expect(deleteNote(song, 'other')).toBe(song);
  });

  it('keeps the rows the notes are over to a hundredth, and is unchanged when they are the same', () => {
    const { song, id } = addNote(SONG, 1, 10);
    const relaid = withPrintRows(song, new Map([[id, 1.23456]]));
    expect(relaid.notes[0]?.printRow).toBe(1.23);
    expect(withPrintRows(relaid, new Map([[id, 1.2301]]))).toBe(relaid);
  });
});
