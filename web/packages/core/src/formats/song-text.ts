// The plain text format: title and artist lines, a "Key: …" line, then "[Section]" headings with each
// chord line above its lyric line. A heading followed by "(Repeat)" is a repeat of that section.
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

  for (const raw of text.replaceAll('\r\n', '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = HEADING.exec(line.trim());

    if (heading) {
      section = { name: heading[1]!, repeat: false, lines: [] };
      song.sections.push(section);
      pendingChords = null;
    } else if (line.trim().length === 0) {
      pendingChords = null;
    } else if (section === null && headerLines.length < 2 && !isInfoLine(line)) {
      headerLines.push(line.trim());
    } else if (section === null && isInfoLine(line)) {
      readInfo(song, line);
    } else {
      if (section === null) {
        section = { name: DEFAULT_SECTION, repeat: false, lines: [] };
        song.sections.push(section);
      }

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

  song.title = headerLines[0] ?? '';
  song.artist = headerLines[1] ?? '';

  // Every section needs a line to type into.
  for (const s of song.sections) {
    if (s.lines.length === 0 && !s.repeat) s.lines.push({ text: '', chords: [] });
  }
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

    const lines = section.lines.filter((l) => l.text.trim().length > 0 || l.chords.length > 0);
    if (lines.length === 0) continue;
    if (out.length > 0) out.push('');
    out.push(`[${section.name}]`);
    for (const line of lines) {
      if (line.chords.length > 0) out.push(chordLine(line));
      if (line.text.trim().length > 0) out.push(line.text.trimEnd());
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
