// Ported from SongCreator.Tests/SongLineTests.cs.
import { describe, expect, it } from 'vitest';
import { applyTextChange, joinLines, splitAt, type SongLine } from '../src';

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
