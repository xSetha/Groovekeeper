// What goes on each page of an exported PDF, worked out without any PDF library so it can be tested. The
// pages follow the desktop's PDF export (SongPdfWriter): A4, 2 cm margins, songs one after another under a
// thin line, and nothing split that's read together.
import {
  chordLine, displayTitle, parseKey, repeatedSections, romanNumeral, toSolfege, type Song,
} from '@groovekeeper/core';
import type { SongNote } from '../library/db';

/** How chords are written in the PDF: letters, Do Re Mi, or Roman numerals in each song's key (a song without a key keeps letters). */
export type ChordStyle = 'letters' | 'solfege' | 'numerals';

export interface ExportOptions {
  collapseRepeats: boolean;
  chords: ChordStyle;
}

/** How each chord of the song is written in the PDF, or undefined to write it as the song has it. */
export function chordDisplay(song: Song, style: ChordStyle): ((name: string) => string) | undefined {
  if (style === 'solfege') return toSolfege;
  if (style === 'numerals' && parseKey(song.key)) return (name) => romanNumeral(name, song.key) ?? name;
  return undefined;
}

/** The song's key as the "Key:" line writes it: in Do Re Mi when the chords are. */
export const keyText = (song: Song, style: ChordStyle): string => (style === 'solfege' ? toSolfege(song.key) : song.key);

/** A song to export, as it's written, with the notes floating over it. */
export interface ExportSong {
  song: Song;
  notes?: SongNote[];
}

/**
 * A section as it's printed: collapsed to "[Chorus] (repeat)", or its lines as chord row and lyric, each with
 * its index among the song's lines (which notes are placed by).
 */
export interface PrintedSection {
  name: string;
  collapsed: boolean;
  lines: PrintedLine[];
}

export interface PrintedLine {
  index: number;
  chords: string;
  text: string;
}

/**
 * The song's sections as printed, with the options applied: as the editor shows them, every section (an empty
 * one is its heading) and every blank line.
 */
export function printedSections(song: Song, options: ExportOptions): PrintedSection[] {
  const repeated = options.collapseRepeats ? repeatedSections(song) : new Set<number>();
  const display = chordDisplay(song, options.chords);
  let lineIndex = 0;
  return song.sections.map((section, index) => {
    const collapsed = section.repeat || repeated.has(index);
    const first = lineIndex;
    lineIndex += section.lines.length;
    const lines = collapsed
      ? []
      : section.lines.map((line, i) => ({
          index: first + i,
          chords: line.chords.length > 0 ? chordLine(line, display) : '',
          text: line.text.trimEnd(),
        }));
    return { name: section.name, collapsed, lines };
  });
}

/** A note as printed: the printed line it goes with (by its index), and how far towards the next line it starts. */
export interface PlacedNote {
  note: SongNote;
  line: number;
  towardsNext: number;
}

/**
 * Where each note is printed, as on the desktop: with the line its row is on (above the first line or below the
 * last, with that one), moved down by how far it was towards the next line. A note over a line that isn't
 * printed, in a collapsed repeat, goes with the printed line before it (or after, at the start of the song).
 */
export function placeNotes(song: Song, sections: PrintedSection[], notes: readonly SongNote[]): PlacedNote[] {
  const count = song.sections.reduce((sum, section) => sum + section.lines.length, 0);
  const printed = new Set(sections.flatMap((section) => section.lines.map((line) => line.index)));
  if (count === 0 || printed.size === 0) return [];
  return notes.map((note) => {
    const index = Math.min(Math.max(Math.floor(note.printRow), 0), count - 1);
    const before = [...printed].filter((line) => line <= index);
    const line = before.length > 0 ? Math.max(...before) : Math.min(...printed);
    return { note, line, towardsNext: note.printRow - index };
  });
}

/**
 * Cuts a chord row and its lyric into pieces at the same columns, so a long line can wrap between pieces
 * and every chord still sits above its letter. A piece starts at a word of the lyric (or at a chord, on a
 * line of chords only), and never in the middle of a chord name.
 */
export function lineSegments(chords: string, text: string): { chords: string; text: string }[] {
  const width = Math.max(chords.length, text.length);
  const chordRow = chords.padEnd(width);
  const lyric = text.padEnd(width);
  const chordsOnly = text.trim().length === 0;
  const startsPiece = (i: number) =>
    chordRow[i - 1] === ' ' &&
    (chordsOnly ? chordRow[i] !== ' ' : lyric[i - 1] === ' ' && lyric[i] !== ' ');

  const segments: { chords: string; text: string }[] = [];
  let start = 0;
  for (let i = 1; i <= width; i++) {
    if (i === width || startsPiece(i)) {
      segments.push({ chords: chordRow.slice(start, i), text: lyric.slice(start, i) });
      start = i;
    }
  }
  return segments;
}

/**
 * A chord row and its lyric wrapped to `columns` letters: the pieces of `lineSegments` fill each row, and a
 * piece longer than a whole row is cut where the row ends.
 */
export function wrapLine(chords: string, text: string, columns: number): { chords: string; text: string }[] {
  const rows: { chords: string; text: string }[] = [];
  let row = { chords: '', text: '' };
  for (const piece of lineSegments(chords, text)) {
    // Spaces at the end of a piece may run past the edge: they aren't printed.
    const fits = (r: typeof row) => (r.chords + piece.chords).trimEnd().length <= columns && (r.text + piece.text).trimEnd().length <= columns;
    if (row.chords.length + row.text.length > 0 && !fits(row)) {
      rows.push(row);
      row = { chords: '', text: '' };
    }
    row = { chords: row.chords + piece.chords, text: row.text + piece.text };
    while (row.chords.trimEnd().length > columns || row.text.trimEnd().length > columns) {
      rows.push({ chords: row.chords.slice(0, columns), text: row.text.slice(0, columns) });
      row = { chords: row.chords.slice(columns), text: row.text.slice(columns) };
    }
  }
  rows.push(row);
  return rows.map((r) => ({ chords: r.chords.trimEnd(), text: r.text.trimEnd() }));
}

// ---- Pages ----

export type Face = 'sans' | 'sansBold' | 'sansItalic' | 'mono' | 'monoBold';
export type Ink = 'fg' | 'muted' | 'chord' | 'line';

/** Text whose baseline is at `y` points from the top of the page, or a line across the page at `y`. */
export type Mark =
  | { kind: 'text'; x: number; y: number; text: string; face: Face; size: number; ink: Ink }
  | { kind: 'rule'; y: number };

/** The width of the text in points. */
export type Measure = (text: string, face: Face, size: number) => number;

export const PAGE = { width: 595.28, height: 841.89, margin: 56.69 }; // A4 in points, 2 cm margins

const SONG_SIZE = 10.5;
// A letter of Cascadia Mono, the songs' font, is 1200 of its 2048 units wide.
const MONO_ADVANCE_EM = 1200 / 2048;
/** How many letters of a song's lines fit across the page; longer lines wrap. The editor marks this edge. */
export const PRINTED_COLUMNS = Math.floor((PAGE.width - 2 * PAGE.margin) / (SONG_SIZE * MONO_ADVANCE_EM));
const SONG_ROW = 13; // a row of lyrics or chords
const TITLE_SIZE = 18;
const SUBTITLE_SIZE = 11;
const KEY_SIZE = 9;
const SECTION_GAP = 12; // above a section's heading
const SONG_GAP = 22; // above and below the line between two songs
const NOTE_SIZE = 9;
const NOTE_ROW = NOTE_SIZE * 1.3;

/** A run of rows kept on one page; each row is its height and its marks, placed from the row's top. */
type Block = { height: number; marks: (top: number) => Mark[] }[];

/** The pages of the PDF, each a list of marks. */
export function layoutPdf(songs: ExportSong[], options: ExportOptions, measure: Measure): Mark[][] {
  const left = PAGE.margin;
  const width = PAGE.width - 2 * PAGE.margin;
  const bottom = PAGE.height - PAGE.margin;
  const columns = Math.max(1, Math.floor(width / measure('M', 'mono', SONG_SIZE)));

  const pages: Mark[][] = [[]];
  let y = PAGE.margin;
  const place = (block: Block) => {
    const height = block.reduce((sum, row) => sum + row.height, 0);
    // A block that doesn't fit starts the next page, unless it's at the top already (longer than a page).
    if (y + height > bottom && y > PAGE.margin) {
      pages.push([]);
      y = PAGE.margin;
    }
    for (const row of block) {
      pages.at(-1)!.push(...row.marks(y)); // pages always has at least one page
      y += row.height;
    }
  };

  const text = (x: number, baseline: number, value: string, face: Face, size: number, ink: Ink) =>
    ({ kind: 'text', x, y: baseline, text: value, face, size, ink }) as const;
  const row = (height: number, marks: (top: number) => Mark[]) => ({ height, marks });
  const gap = (height: number) => row(height, () => []);
  // A baseline about four fifths of the way down a row.
  const baseline = (top: number, height: number) => top + height * 0.8;

  const songRows = (chords: string, lyric: string): Block =>
    // A blank line keeps the height of a lyric.
    !chords && !lyric ? [gap(SONG_ROW)] : wrapLine(chords, lyric, columns).flatMap((r) => [
      ...(chords ? [row(SONG_ROW, (top) => [text(left, baseline(top, SONG_ROW), r.chords, 'monoBold', SONG_SIZE, 'chord')])] : []),
      ...(lyric ? [row(SONG_ROW, (top) => [text(left, baseline(top, SONG_ROW), r.text, 'mono', SONG_SIZE, 'fg')])] : []),
    ]);

  /**
   * A line's rows, with the notes that go with it drawn over them. A note starts below the line's top by how far
   * it was towards the next line, measured in what comes before that line: these rows, and a heading when the
   * line ends its section.
   */
  const lineRows = (line: PrintedLine, notes: Map<number, PlacedNote[]>, endsSection: boolean): Block => {
    const rows = songRows(line.chords, line.text);
    const placed = notes.get(line.index);
    if (!placed || rows.length === 0) return rows;
    const height = rows.reduce((sum, r) => sum + r.height, 0) + (endsSection ? SECTION_GAP + SONG_ROW + 2 : 0);
    const letter = measure('M', 'mono', SONG_SIZE);
    const [first, ...others] = rows;
    const noteMarks = (top: number): Mark[] =>
      placed.flatMap(({ note, towardsNext }) =>
        note.text.split('\n').map((textLine, i) =>
          text(left + note.column * letter, top + towardsNext * height + NOTE_ROW * i + NOTE_SIZE, textLine, 'sansItalic', NOTE_SIZE, 'muted')));
    // Drawn after the line, so the notes are on top of it.
    return [row(first!.height, (top) => [...first!.marks(top), ...noteMarks(top)]), ...others];
  };

  const sectionStart = (section: PrintedSection, notes: Map<number, PlacedNote[]>, last: boolean): Block => {
    const heading = `[${section.name}]`;
    if (section.collapsed) {
      const after = left + measure(heading, 'monoBold', SONG_SIZE) + 6;
      return [
        gap(SECTION_GAP),
        row(SONG_ROW, (top) => [
          text(left, baseline(top, SONG_ROW), heading, 'monoBold', SONG_SIZE, 'muted'),
          text(after, baseline(top, SONG_ROW), '(repeat)', 'sansItalic', KEY_SIZE, 'muted'),
        ]),
      ];
    }
    const [first] = section.lines;
    return [
      gap(SECTION_GAP),
      row(SONG_ROW + 2, (top) => [text(left, baseline(top, SONG_ROW), heading, 'monoBold', SONG_SIZE, 'muted')]),
      ...(first ? lineRows(first, notes, !last && section.lines.length === 1) : []),
    ];
  };

  const header = ({ song }: ExportSong): Block => {
    const titleLines = wrapWords(displayTitle(song), 'sansBold', TITLE_SIZE, width, measure);
    const rows: Block = titleLines.map((line) =>
      row(TITLE_SIZE * 1.25, (top) => [text(left, baseline(top, TITLE_SIZE * 1.25), line, 'sansBold', TITLE_SIZE, 'fg')]));
    if (song.artist) {
      rows.push(row(SUBTITLE_SIZE * 1.4, (top) => [text(left, baseline(top, SUBTITLE_SIZE * 1.4), song.artist, 'sans', SUBTITLE_SIZE, 'muted')]));
    }
    if (song.key) {
      rows.push(row(4 + KEY_SIZE * 1.4, (top) => [text(left, baseline(top + 4, KEY_SIZE * 1.4), `Key: ${keyText(song, options.chords)}`, 'sans', KEY_SIZE, 'muted')]));
    }
    return rows;
  };

  songs.forEach((exported, index) => {
    if (index > 0) {
      // The line between songs; at the top of a page there's nothing to separate.
      if (y + 2 * SONG_GAP < bottom) {
        place([row(2 * SONG_GAP, (top) => [{ kind: 'rule', y: top + SONG_GAP }])]);
      } else {
        pages.push([]);
        y = PAGE.margin;
      }
    }
    const sections = printedSections(exported.song, options);
    const notes = new Map<number, PlacedNote[]>();
    for (const placed of placeNotes(exported.song, sections, exported.notes ?? [])) {
      notes.set(placed.line, [...(notes.get(placed.line) ?? []), placed]);
    }
    const rest = (section: PrintedSection, index: number) => {
      const last = index === sections.length - 1;
      section.lines.slice(1).forEach((line, i) => place(lineRows(line, notes, !last && i === section.lines.length - 2)));
    };
    // The title is kept with the start of the first section, so it's never left alone at the bottom of a page.
    sections.forEach((section, index) => {
      const start = sectionStart(section, notes, index === sections.length - 1);
      // A section's heading is kept with its first line; every chord row stays with its lyric.
      place(index === 0 ? [...header(exported), ...start] : start);
      rest(section, index);
    });
    if (sections.length === 0) place(header(exported));
  });
  return pages;
}

/** Text split between words into lines no wider than `width`. */
function wrapWords(value: string, face: Face, size: number, width: number, measure: Measure): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, face, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  return [...lines, line];
}
