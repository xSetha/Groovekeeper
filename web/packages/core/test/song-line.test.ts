// Ported from SongCreator.Tests/SongLineTests.cs.
import { describe, expect, it } from 'vitest';
import { applyTextChange, joinLines, splitAt, textChange, type SongLine } from '../src';

const line = (text: string, ...chords: [number, string][]): SongLine =>
  ({ text, chords: chords.map(([position, name]) => ({ position, name })) });

const positions = (l: SongLine): number[] => l.chords.map((c) => c.position);

describe('applyTextChange', () => {
  it('shifts a chord after an insert before it', () => {
    expect(positions(applyTextChange(line('hello world', [0, 'C'], [6, 'G']), 3, 0, 2))).toEqual([0, 8]);
  });

  it('keeps a chord on its letter when inserting at its position', () => {
    expect(positions(applyTextChange(line('hello world', [6, 'G']), 6, 0, 1))).toEqual([7]);
  });

  it('shifts a chord back after a delete before it', () => {
    expect(positions(applyTextChange(line('hello world', [6, 'G']), 0, 2, 0))).toEqual([4]);
  });

  it("moves a chord to the deletion point when its letter is deleted", () => {
    expect(positions(applyTextChange(line('hello world', [7, 'G']), 5, 4, 0))).toEqual([5]);
  });

  it('leaves chords past the text in their column', () => {
    expect(positions(applyTextChange(line('', [0, 'Dm'], [4, 'Gm']), 0, 0, 3))).toEqual([0, 4]);
  });
});

describe('textChange', () => {
  it('finds typed text', () => {
    expect(textChange('hello world', 'hello big world', 10)).toEqual({ offset: 6, removed: 0, added: 4 });
  });

  it('finds deleted text', () => {
    expect(textChange('hello world', 'hello', 5)).toEqual({ offset: 5, removed: 6, added: 0 });
    expect(textChange('hello world', 'world', 0)).toEqual({ offset: 0, removed: 6, added: 0 });
  });

  it('finds replaced text', () => {
    expect(textChange('hello world', 'hello there', 11)).toEqual({ offset: 6, removed: 5, added: 5 });
  });

  it('uses the caret to tell where a repeated letter was typed', () => {
    expect(textChange('hello', 'helllo', 3)).toEqual({ offset: 2, removed: 0, added: 1 });
    expect(textChange('hello', 'helllo', 4)).toEqual({ offset: 3, removed: 0, added: 1 });
    expect(textChange('hello', 'helllo', 5)).toEqual({ offset: 4, removed: 0, added: 1 });
  });

  it('uses the caret to tell which repeated letter was deleted', () => {
    expect(textChange('helllo', 'hello', 2)).toEqual({ offset: 2, removed: 1, added: 0 });
    expect(textChange('helllo', 'hello', 4)).toEqual({ offset: 4, removed: 1, added: 0 });
  });

  it('keeps a chord on its letter while typing before it', () => {
    const before = line('Amazing grace', [8, 'C']);
    const change = textChange(before.text, 'Amazing, grace', 8);
    expect(positions(applyTextChange(before, change.offset, change.removed, change.added))).toEqual([9]);
  });
});

describe('splitAt', () => {
  it('moves the tail text and its chords to a new line', () => {
    const [head, tail] = splitAt(line('hello world', [0, 'C'], [6, 'G']), 6);
    expect(head).toEqual(line('hello ', [0, 'C']));
    expect(tail).toEqual(line('world', [0, 'G']));
  });
});

describe('joinLines', () => {
  it("shifts the next line's chords", () => {
    expect(joinLines(line('hello ', [0, 'C']), line('world', [0, 'G']))).toEqual(line('hello world', [0, 'C'], [6, 'G']));
  });
});
