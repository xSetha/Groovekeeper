// Editing a lyric line while keeping each chord over its letter.
import type { ChordPlacement, SongLine } from './song';

const placed = (position: number, name: string): ChordPlacement => ({ position: Math.max(0, position), name });

/**
 * The line's chords moved for a text edit at `offset` (`removed` characters replaced by `added`), so they
 * stay attached to their letters. Takes the line from before the edit; the text is not changed. Chords
 * past the end of the text are not over a letter, so they keep their column (typing lyrics under a
 * chord-only line doesn't push them).
 */
export function applyTextChange(line: SongLine, offset: number, removed: number, added: number): SongLine {
  return {
    ...line,
    chords: line.chords.map((chord) => {
      if (chord.position >= line.text.length) return chord;
      if (chord.position >= offset + removed) return placed(chord.position + added - removed, chord.name);
      if (chord.position > offset) return placed(offset, chord.name);
      return chord;
    }),
  };
}

/**
 * The edit that turned `before` into `after`, for {@link applyTextChange}: where it starts, how many
 * characters it removed and how many it added. `caret` is where the caret is after the edit, which is
 * where typed or pasted text ends; it decides where a run of the same letter was typed into ("hel|lo").
 */
export function textChange(before: string, after: string, caret: number): { offset: number; removed: number; added: number } {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  // Counted on its own: with a repeated letter, the common start and the common end overlap.
  let suffix = 0;
  while (
    suffix < before.length && suffix < after.length &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix++;

  // Typed or pasted text ends at the caret, so the unchanged end of the line is what follows the caret.
  const tail = Math.max(0, Math.min(after.length - caret, suffix));
  const offset = Math.min(prefix, before.length - tail, caret);
  return { offset, removed: before.length - offset - tail, added: after.length - offset - tail };
}

/** Cuts the line at `index`: the head keeps the text and chords before it, the tail gets the rest. */
export function splitAt(line: SongLine, index: number): [head: SongLine, tail: SongLine] {
  index = Math.min(Math.max(index, 0), line.text.length);
  return [
    { text: line.text.slice(0, index), chords: line.chords.filter((c) => c.position < index) },
    {
      text: line.text.slice(index),
      chords: line.chords.filter((c) => c.position >= index).map((c) => placed(c.position - index, c.name)),
    },
  ];
}

/** `next` appended to the end of `line`, text and chords. */
export function joinLines(line: SongLine, next: SongLine): SongLine {
  const shift = line.text.length;
  return {
    text: line.text + next.text,
    chords: [...line.chords, ...next.chords.map((c) => placed(c.position + shift, c.name))],
  };
}
