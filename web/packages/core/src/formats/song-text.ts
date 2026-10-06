// The plain text format: title and artist lines, a "Key: …" line, then "[Section]" headings with each
// chord line above its lyric line. A heading followed by "(Repeat)" is a repeat of that section. One blank
// line separates sections; other blank lines in a section are blank lines of the song.
// Files from older versions have "Tuning: … · Key: …" there; the tuning is ignored.
import { isChord } from '../music/chord';
import type { Section, Song, SongLine } from '../models/song';
import { emptySong } from '../models/song';

/** The line under a heading that marks the section as a repeat. */
export const REPEAT_MARKER = '(Repeat)';

const HEADING = /^\[(.+)\]$/;
const TOKEN = /\S+/g;
const DEFAULT_SECTION = 'Verse 1';

export function parseSongText(text: string): Song {
  const song = emptySong();
  const headerLines: string[] = [];
  let section: Section | null = null;
  let pendingChords: SongLine | null = null;
  // Blank lines in a section not yet added: the last one before a heading separates sections.
  let blankLines = 0;
  const addBlankLines = (count: number) => {
    for (let i = 0; i < count; i++) section!.lines.push({ text: '', chords: [] });
    blankLines = 0;
  };

  const rows = text.replaceAll('\r\n', '\n').split('\n');
  if (rows.at(-1) === '') rows.pop(); // the newline that ends the last line
  for (const raw of rows) {
    const line = raw.trimEnd();
    const heading = HEADING.exec(line.trim());

    if (heading) {
      if (section !== null) addBlankLines(Math.max(0, blankLines - 1));
      section = { name: heading[1]!, repeat: false, lines: [] };
      song.sections.push(section);
      pendingChords = null;
    } else if (line.trim().length === 0) {
      pendingChords = null;
      if (section !== null) blankLines++;
    } else if (section === null && headerLines.length < 2 && !isInfoLine(line)) {
      headerLines.push(line.trim());
    } else if (section === null && isInfoLine(line)) {
      readInfo(song, line);
    } else {
      if (section === null) {
        section = { name: DEFAULT_SECTION, repeat: false, lines: [] };
        song.sections.push(section);
      }
      addBlankLines(blankLines);

      if (section.lines.length === 0 && line.trim() === REPEAT_MARKER) {
        section.repeat = true;
      } else if (isChordLine(line)) {
        pendingChords = {
          text: '',
          chords: [...line.matchAll(TOKEN)].map((token) => ({ position: token.index, name: token[0] })),
        };
        section.lines.push(pendingChords);
      } else if (pendingChords !== null) {
        pendingChords.text = line;
        pendingChords = null;
      } else {
        section.lines.push({ text: line, chords: [] });
      }
    }
  }

  if (section !== null) addBlankLines(blankLines);

  song.title = headerLines[0] ?? '';
  song.artist = headerLines[1] ?? '';

  return song;
}

export function isChordLine(line: string): boolean {
  const tokens = line.match(TOKEN) ?? [];
  return tokens.length > 0 && tokens.every(isChord);
}

const isInfoLine = (line: string): boolean => {
  const trimmed = line.trim();
  return trimmed.startsWith('Tuning:') || trimmed.startsWith('Key:');
};

function readInfo(song: Song, line: string): void {
  for (const part of line.split('·')) {
    const field = part.trim();
    if (field.startsWith('Key:')) song.key = field.slice('Key:'.length).trim();
  }
}

/** Writes a song as plain monospace text: each chord line sits above its lyric line. */
export function songToText(song: Song): string {
  const out: string[] = [];
  if (song.title.length > 0) out.push(song.title);
  if (song.artist.length > 0) out.push(song.artist);

  if (song.key.length > 0) {
    if (out.length > 0) out.push('');
    out.push(`Key: ${song.key}`);
  }

  for (const section of song.sections) {
    if (section.repeat) {
      if (out.length > 0) out.push('');
      out.push(`[${section.name}]`, REPEAT_MARKER);
      continue;
    }

    // Every section and line is written, empty ones too, so the song reads back as it was. A line with
    // nothing on it is a blank line; the blank line before the next heading separates sections.
    if (out.length > 0) out.push('');
    out.push(`[${section.name}]`);
    for (const line of section.lines) {
      const hasText = line.text.trim().length > 0;
      if (line.chords.length > 0) out.push(chordLine(line));
      if (hasText) out.push(line.text.trimEnd());
      else if (line.chords.length === 0) out.push('');
    }
  }
  return out.map((line) => line + '\n').join('');
}

/**
 * Places each chord at its column; a chord that would overlap the previous one is pushed right.
 * `display` can write each chord differently (e.g. as a Roman numeral).
 */
export function chordLine(line: SongLine, display?: (name: string) => string): string {
  let text = '';
  for (const chord of [...line.chords].sort((a, b) => a.position - b.position)) {
    let padding = chord.position - text.length;
    if (text.length > 0) padding = Math.max(padding, 1);
    text += ' '.repeat(Math.max(padding, 0)) + (display ? display(chord.name) : chord.name);
  }
  return text;
}
