// Edits to a song in the editor. Each returns a new song and leaves the old one as it was.
import { applyTextChange, joinLines, splitAt, textChange, type Song, type SongLine } from '@groovekeeper/core';

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

export const lineAt = (song: Song, at: LineAt): SongLine | undefined => song.sections[at.section]?.lines[at.line];

/** The song with the lines of one section replaced. */
function withLines(song: Song, section: number, change: (lines: SongLine[]) => SongLine[]): Song {
  return {
    ...song,
    sections: song.sections.map((s, i) => (i === section ? { ...s, lines: change(s.lines) } : s)),
  };
}

const withLine = (song: Song, at: LineAt, change: (line: SongLine) => SongLine): Song =>
  withLines(song, at.section, (lines) => lines.map((l, i) => (i === at.line ? change(l) : l)));

/** The line's lyrics changed to `text` by typing, with the caret now at `caret`; the chords stay on their letters. */
export function editText(song: Song, at: LineAt, text: string, caret: number): Song {
  return withLine(song, at, (line) => {
    const change = textChange(line.text, text, caret);
    return { ...applyTextChange(line, change.offset, change.removed, change.added), text };
  });
}

/** Enter: the line is cut at the caret, and the rest goes onto a new line below it. */
export function splitLine(song: Song, at: LineAt, caret: number): { song: Song; focus: Focus } {
  const line = lineAt(song, at);
  if (!line) return { song, focus: { at, caret } };
  const [head, tail] = splitAt(line, caret);
  return {
    song: withLines(song, at.section, (lines) => [...lines.slice(0, at.line), head, tail, ...lines.slice(at.line + 1)]),
    focus: { at: { section: at.section, line: at.line + 1 }, caret: 0 },
  };
}

/**
 * Backspace at the start of a line: joins it onto the line above in its section, or removes it if it's
 * an empty first line. Null when there's nothing to do.
 */
export function joinWithPrevious(song: Song, at: LineAt): { song: Song; focus: Focus } | null {
  const lines = song.sections[at.section]?.lines;
  const line = lines?.[at.line];
  if (!lines || !line) return null;

  const previous = lines[at.line - 1];
  if (previous) {
    return {
      song: withLines(song, at.section, (all) =>
        all.flatMap((l, i) => (i === at.line - 1 ? [joinLines(previous, line)] : i === at.line ? [] : [l]))),
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
export function neighbourLine(song: Song, at: LineAt, direction: -1 | 1): LineAt | null {
  const all = song.sections.flatMap((section, s) => section.lines.map((_, l) => ({ section: s, line: l })));
  const index = all.findIndex((a) => a.section === at.section && a.line === at.line);
  return all[index + direction] ?? null;
}

/** A chord dropped at a column: it replaces a chord already there, or is added. */
export function placeChord(song: Song, at: LineAt, column: number, name: string): Song {
  const position = Math.max(0, column);
  return withLine(song, at, (line) => ({
    ...line,
    chords: line.chords.some((c) => c.position === position)
      ? line.chords.map((c) => (c.position === position ? { ...c, name } : c))
      : [...line.chords, { position, name }],
  }));
}

export function moveChord(song: Song, at: LineAt, index: number, position: number): Song {
  return withLine(song, at, (line) => ({
    ...line,
    chords: line.chords.map((c, i) => (i === index ? { ...c, position: Math.max(0, position) } : c)),
  }));
}

export function removeChord(song: Song, at: LineAt, index: number): Song {
  return withLine(song, at, (line) => ({ ...line, chords: line.chords.filter((_, i) => i !== index) }));
}

/** The chords of the song, each once, in the order they first appear. */
export function chordsInSong(song: Song): string[] {
  const names = song.sections.flatMap((s) => s.lines).flatMap((l) => [...l.chords].sort((a, b) => a.position - b.position));
  return [...new Set(names.map((c) => c.name))];
}
