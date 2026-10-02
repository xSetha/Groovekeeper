// Edits to a song in the editor. Each returns a new song and leaves the old one as it was.
import { applyTextChange, joinLines, splitAt, textChange, type ChordPlacement, type Song } from '@groovekeeper/core';

// The editor's copy of a song gives every section, line and chord an id, so React keeps each text box and
// chord with its own content when lines are split, joined or moved. The ids are never saved.
export interface KeyedChord extends ChordPlacement {
  id: string;
}

export interface KeyedLine {
  id: string;
  text: string;
  chords: KeyedChord[];
}

export interface KeyedSection {
  id: string;
  name: string;
  repeat: boolean;
  lines: KeyedLine[];
}

export interface KeyedSong extends Song {
  sections: KeyedSection[];
}

let lastId = 0;
const newId = (): string => String(++lastId);

/** The song with an id on every section, line and chord. */
export const withIds = (song: Song): KeyedSong => ({
  ...song,
  sections: song.sections.map((section) => ({
    ...section,
    id: newId(),
    lines: section.lines.map((line) => ({
      ...line,
      id: newId(),
      chords: line.chords.map((chord) => ({ ...chord, id: newId() })),
    })),
  })),
});

/** A line of the song: the index of its section, and of the line within the section. */
export interface LineAt {
  section: number;
  line: number;
}

/** Where the caret goes after an edit. */
export interface Focus {
  at: LineAt;
  caret: number;
}

export const lineAt = (song: KeyedSong, at: LineAt): KeyedLine | undefined => song.sections[at.section]?.lines[at.line];

/** The song with the lines of one section replaced. */
function withLines(song: KeyedSong, section: number, change: (lines: KeyedLine[]) => KeyedLine[]): KeyedSong {
  return {
    ...song,
    sections: song.sections.map((s, i) => (i === section ? { ...s, lines: change(s.lines) } : s)),
  };
}

const withLine = (song: KeyedSong, at: LineAt, change: (line: KeyedLine) => KeyedLine): KeyedSong =>
  withLines(song, at.section, (lines) => lines.map((l, i) => (i === at.line ? change(l) : l)));

/** The line's lyrics changed to `text` by typing, with the caret now at `caret`; the chords stay on their letters. */
export function editText(song: KeyedSong, at: LineAt, text: string, caret: number): KeyedSong {
  return withLine(song, at, (line) => {
    const change = textChange(line.text, text, caret);
    return { ...line, chords: applyTextChange(line, change.offset, change.removed, change.added).chords, text };
  });
}

/** Enter: the line is cut at the caret, and the rest goes onto a new line below it. */
export function splitLine(song: KeyedSong, at: LineAt, caret: number): { song: KeyedSong; focus: Focus } {
  const line = lineAt(song, at);
  if (!line) return { song, focus: { at, caret } };
  const [head, tail] = splitAt(line, caret);
  return {
    song: withLines(song, at.section, (lines) => [
      ...lines.slice(0, at.line),
      { ...head, id: line.id },
      { ...tail, id: newId() },
      ...lines.slice(at.line + 1),
    ]),
    focus: { at: { section: at.section, line: at.line + 1 }, caret: 0 },
  };
}

/**
 * Backspace at the start of a line: joins it onto the line above in its section, or removes it if it's
 * an empty first line. Null when there's nothing to do.
 */
export function joinWithPrevious(song: KeyedSong, at: LineAt): { song: KeyedSong; focus: Focus } | null {
  const lines = song.sections[at.section]?.lines;
  const line = lines?.[at.line];
  if (!lines || !line) return null;

  const previous = lines[at.line - 1];
  if (previous) {
    const joined = { ...joinLines(previous, line), id: previous.id };
    return {
      song: withLines(song, at.section, (all) =>
        all.flatMap((l, i) => (i === at.line - 1 ? [joined] : i === at.line ? [] : [l]))),
      focus: { at: { section: at.section, line: at.line - 1 }, caret: previous.text.length },
    };
  }
  if (line.text.length === 0 && line.chords.length === 0 && lines.length > 1) {
    return {
      song: withLines(song, at.section, (all) => all.slice(1)),
      focus: { at, caret: 0 },
    };
  }
  return null;
}

/** The line above (-1) or below (+1), across sections; null at the start or end of the song. */
export function neighbourLine(song: KeyedSong, at: LineAt, direction: -1 | 1): LineAt | null {
  const all = song.sections.flatMap((section, s) => section.lines.map((_, l) => ({ section: s, line: l })));
  const index = all.findIndex((a) => a.section === at.section && a.line === at.line);
  return all[index + direction] ?? null;
}

/** A chord dropped at a column: it replaces a chord already there, or is added. */
export function placeChord(song: KeyedSong, at: LineAt, column: number, name: string): KeyedSong {
  const position = Math.max(0, column);
  return withLine(song, at, (line) => ({
    ...line,
    chords: line.chords.some((c) => c.position === position)
      ? line.chords.map((c) => (c.position === position ? { ...c, name } : c))
      : [...line.chords, { position, name, id: newId() }],
  }));
}

export function moveChord(song: KeyedSong, at: LineAt, chordId: string, position: number): KeyedSong {
  return withLine(song, at, (line) => ({
    ...line,
    chords: line.chords.map((c) => (c.id === chordId ? { ...c, position: Math.max(0, position) } : c)),
  }));
}

export function removeChord(song: KeyedSong, at: LineAt, chordId: string): KeyedSong {
  return withLine(song, at, (line) => ({ ...line, chords: line.chords.filter((c) => c.id !== chordId) }));
}

/** The chords of the song, each once, in the order they first appear. */
export function chordsInSong(song: Song): string[] {
  const names = song.sections.flatMap((s) => s.lines).flatMap((l) => l.chords.toSorted((a, b) => a.position - b.position));
  return [...new Set(names.map((c) => c.name))];
}
