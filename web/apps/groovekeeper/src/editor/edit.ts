// Edits to a song in the editor. Each returns a new song and leaves the old one as it was.
import {
  applyTextChange, isChord, isChordLine, joinLines, splitAt, textChange, type ChordPlacement, type Song,
} from '@groovekeeper/core';

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

/** Where the caret goes after an edit: a line (by id, which stays put when lines move) and a place in it. */
export interface Focus {
  lineId: string;
  caret: number;
}

export const lineAt = (song: KeyedSong, at: LineAt): KeyedLine | undefined => song.sections[at.section]?.lines[at.line];

/** Where the line with this id is in the song, or null if it's gone. */
export function findLine(song: KeyedSong, lineId: string): LineAt | null {
  for (const [section, s] of song.sections.entries()) {
    const line = s.lines.findIndex((l) => l.id === lineId);
    if (line >= 0) return { section, line };
  }
  return null;
}

/** The song with the lines of one section replaced. */
function withLines(song: KeyedSong, section: number, change: (lines: KeyedLine[]) => KeyedLine[]): KeyedSong {
  return {
    ...song,
    sections: song.sections.map((s, i) => (i === section ? { ...s, lines: change(s.lines) } : s)),
  };
}

const emptyLine = (): KeyedLine => ({ id: newId(), text: '', chords: [] });

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
export function splitLine(song: KeyedSong, at: LineAt, caret: number): { song: KeyedSong; focus: Focus } | null {
  const line = lineAt(song, at);
  if (!line) return null;
  const [head, tail] = splitAt(line, caret);
  const newLine = { ...tail, id: newId() };
  return {
    song: withLines(song, at.section, (lines) => [
      ...lines.slice(0, at.line),
      { ...head, id: line.id },
      newLine,
      ...lines.slice(at.line + 1),
    ]),
    focus: { lineId: newLine.id, caret: 0 },
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
      focus: { lineId: previous.id, caret: previous.text.length },
    };
  }
  const next = lines[1];
  if (line.text.length === 0 && line.chords.length === 0 && next) {
    return {
      song: withLines(song, at.section, (all) => all.slice(1)),
      focus: { lineId: next.id, caret: 0 },
    };
  }
  return null;
}

/** The id of the line above (-1) or below (+1), across sections; null at the start or end of the song. */
export function neighbourLine(song: KeyedSong, lineId: string, direction: -1 | 1): string | null {
  const all = song.sections.flatMap((section) => section.lines.map((line) => line.id));
  const index = all.indexOf(lineId);
  return index < 0 ? null : (all[index + direction] ?? null);
}

/** A chord placed at a column: it replaces a chord already there, or is added. */
export function placeChord(song: KeyedSong, at: LineAt, column: number, name: string): KeyedSong {
  const position = Math.max(0, column);
  return withLine(song, at, (line) => ({
    ...line,
    chords: line.chords.some((c) => c.position === position)
      ? line.chords.map((c) => (c.position === position ? { ...c, name } : c))
      : [...line.chords, { position, name, id: newId() }],
  }));
}

/**
 * A chord typed above the letter at `position`: it renames the chord already there, or is added; an empty name
 * removes that chord. Null if the name isn't a chord, since a chord row with a non-chord in it reads back as lyrics.
 */
export function setChord(song: KeyedSong, at: LineAt, position: number, name: string): KeyedSong | null {
  const trimmed = name.trim();
  const existing = lineAt(song, at)?.chords.find((c) => c.position === position);
  if (trimmed.length === 0) return existing ? removeChord(song, at, existing.id) : song;
  if (!isChord(trimmed)) return null;
  // Unchanged, so it's no undo step and nothing to save.
  return existing?.name === trimmed ? song : placeChord(song, at, position, trimmed);
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

// ---- Song details ----

export const setTitle = (song: KeyedSong, title: string): KeyedSong => ({ ...song, title });
export const setArtist = (song: KeyedSong, artist: string): KeyedSong => ({ ...song, artist });
export const setKey = (song: KeyedSong, key: string): KeyedSong => ({ ...song, key });

// ---- Sections ----

/** The name a new section gets; the user renames it. */
export const NEW_SECTION_NAME = 'New section';

/** A new section with one empty line, focused: right after the section with the id `after`, or at the end of the song. */
export function addSection(song: KeyedSong, after: string | null = null): { song: KeyedSong; focus: Focus } {
  const line = emptyLine();
  // The section may be gone (an undo removed it); then the new one goes at the end.
  const index = song.sections.findIndex((s) => s.id === after);
  const at = index >= 0 ? index + 1 : song.sections.length;
  return {
    song: { ...song, sections: song.sections.toSpliced(at, 0, { id: newId(), name: NEW_SECTION_NAME, repeat: false, lines: [line] }) },
    focus: { lineId: line.id, caret: 0 },
  };
}

/** A new empty line at the end of a section, focused. */
export function addLine(song: KeyedSong, section: number): { song: KeyedSong; focus: Focus } {
  const line = emptyLine();
  return { song: withLines(song, section, (lines) => [...lines, line]), focus: { lineId: line.id, caret: 0 } };
}

export const renameSection = (song: KeyedSong, section: number, name: string): KeyedSong => ({
  ...song,
  sections: song.sections.map((s, i) => (i === section ? { ...s, name } : s)),
});

/** The section moved one place up (-1) or down (+1); unchanged at either end. */
export function moveSection(song: KeyedSong, section: number, direction: -1 | 1): KeyedSong {
  const target = section + direction;
  const moving = song.sections[section];
  const other = song.sections[target];
  if (!moving || !other) return song;
  return { ...song, sections: song.sections.with(section, other).with(target, moving) };
}

/**
 * The section moved so it comes before the section at `insertAt` (counted before the move), or to the end when
 * `insertAt` is the number of sections; unchanged when that's where it already is.
 */
export function moveSectionTo(song: KeyedSong, section: number, insertAt: number): KeyedSong {
  const moving = song.sections[section];
  const to = Math.min(Math.max(insertAt > section ? insertAt - 1 : insertAt, 0), song.sections.length - 1);
  if (!moving || to === section) return song;
  return { ...song, sections: song.sections.toSpliced(section, 1).toSpliced(to, 0, moving) };
}

/** A copy of the section right after it, with new ids. */
export function duplicateSection(song: KeyedSong, section: number): KeyedSong {
  const original = song.sections[section];
  if (!original) return song;
  const copy: KeyedSection = {
    ...original,
    id: newId(),
    lines: original.lines.map((line) => ({ ...line, id: newId(), chords: line.chords.map((c) => ({ ...c, id: newId() })) })),
  };
  return { ...song, sections: song.sections.toSpliced(section + 1, 0, copy) };
}

export const deleteSection = (song: KeyedSong, section: number): KeyedSong => ({
  ...song,
  sections: song.sections.toSpliced(section, 1),
});

/** "Play this section again": a repeat of it at the end of the song. */
export function repeatSection(song: KeyedSong, section: number): KeyedSong {
  const original = song.sections[section];
  if (!original) return song;
  return { ...song, sections: [...song.sections, { id: newId(), name: original.name, repeat: true, lines: [] }] };
}

// ---- Pasting ----

const HEADING = /^\[(.+)\]$/;
const TOKEN = /\S+/g;

/**
 * Text with several lines pasted at the caret: each row becomes a lyric line, a "[Name]" row starts a new
 * section, and a row of chords (chords over lyrics, as on chord sites) puts its chords above the lyric row
 * below it. The rest of the line pasted into goes after the pasted text.
 */
export function pasteLines(song: KeyedSong, at: LineAt, caret: number, text: string): { song: KeyedSong; focus: Focus } | null {
  const original = lineAt(song, at);
  if (!original) return null;
  // Copies of the sections and their line lists, changed in place below; the song passed in stays as it was.
  const sections = song.sections.map((s) => ({ ...s, lines: [...s.lines] }));
  let section = sections[at.section]!;
  const [head, rest] = splitAt(original, caret);
  const line: KeyedLine = { ...head, id: original.id, chords: [...head.chords] };
  section.lines[at.line] = line;
  const tail: KeyedLine = { ...rest, id: newId() };
  let insertAt = at.line + 1;
  let last = line;
  let pendingChords: KeyedLine | null = null; // a chord row waiting for the lyric row below it
  let startedSections = false;

  // Chord sites often line chords up with non-breaking spaces.
  const rows = text.replaceAll('\u00a0', ' ').replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  rows.forEach((raw, i) => {
    const row = raw.trimEnd();
    const heading = HEADING.exec(row.trim());
    if (heading) {
      // Lines after the insertion point belong after the new heading.
      const started: KeyedSection = { id: newId(), name: heading[1]!, repeat: false, lines: section.lines.splice(insertAt) };
      sections.splice(sections.indexOf(section) + 1, 0, started);
      section = started;
      startedSections = true;
      insertAt = 0;
      pendingChords = null;
    } else if (row.trim().length > 0 && isChordLine(row)) {
      // The first chord row goes into the line pasted into, if that line is still blank.
      if (i === 0 && line.text.length === 0 && line.chords.length === 0) {
        last = line;
      } else {
        last = emptyLine();
        section.lines.splice(insertAt++, 0, last);
      }
      for (const token of row.matchAll(TOKEN)) last.chords.push({ position: token.index, name: token[0], id: newId() });
      pendingChords = last;
    } else if (pendingChords && row.trim().length > 0) {
      pendingChords.text = row;
      pendingChords = null;
    } else if (i === 0) {
      line.text += row;
    } else if (row.trim().length > 0) {
      last = { id: newId(), text: row, chords: [] };
      section.lines.splice(insertAt++, 0, last);
    } else {
      pendingChords = null; // a blank row: the chords above were a chord-only line
    }
  });

  if (tail.text.length > 0 || tail.chords.length > 0) section.lines.splice(insertAt, 0, tail);

  // Pasting a whole song into a blank line shouldn't leave that blank line (or its empty section) behind.
  if (line.text.length === 0 && line.chords.length === 0 && last !== line) {
    const home = sections.find((s) => s.lines.includes(line))!;
    home.lines.splice(home.lines.indexOf(line), 1);
    if (home.lines.length === 0) sections.splice(sections.indexOf(home), 1);
  }

  // A pasted song with its own sections replaces the empty ones (a new song's blank Intro, Verse 1, …), which
  // saving would drop anyway.
  const kept = startedSections
    ? sections.filter((s) => s.repeat || s.lines.some((l) => l.text.length > 0 || l.chords.length > 0) || s.lines.includes(last))
    : sections;

  return { song: { ...song, sections: kept }, focus: { lineId: last.id, caret: last.text.length } };
}

/** The chords of the song, each once, in the order they first appear. */
export const chordsInSong = (song: Song): string[] => [...new Set(allChords(song))];

/** Every chord of the song in playing order (repeats aside), as key detection reads them. */
export const allChords = (song: Song): string[] =>
  song.sections.flatMap((s) => s.lines).flatMap((l) => l.chords.toSorted((a, b) => a.position - b.position)).map((c) => c.name);
