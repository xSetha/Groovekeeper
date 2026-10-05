// The ChordPro format: {directive: value} lines and lyrics with chords in brackets ("[G]Amazing").
// Sections come from start_of_…/end_of_… environments, from {comment:} headings, or from paragraphs
// separated by blank lines; in an environment, a blank line is a blank line of the song. {chorus} and a
// heading naming an earlier section with nothing under it are repeats. Directives the song has no place for (capo, tempo, …) are skipped.
import { isChord } from '../music/chord';
import type { Section, Song, SongLine } from '../models/song';
import { emptySong } from '../models/song';

const DIRECTIVE = /^\{\s*([A-Za-z_][\w-]*)\s*(?::\s*(.*?)|\s+(.*?))?\s*\}$/;
// ChordPro 6 can also give a section's name as an attribute: {start_of_verse label="Verse 1"}.
const LABEL = /^label\s*=\s*"(.*)"$/;
const BRACKETED = /\[([^\]]*)\]/g;
const COMMENT_DIRECTIVES = new Set(['comment', 'c', 'comment_italic', 'ci', 'comment_box', 'cb', 'highlight']);
const SHORT_ENVIRONMENTS = new Map([['soc', 'chorus'], ['sov', 'verse'], ['sob', 'bridge'], ['sot', 'tab'], ['sog', 'grid']]);
const SHORT_ENVIRONMENT_ENDS = new Set(['eoc', 'eov', 'eob', 'eot', 'eog']);
const START_OF = 'start_of_';
const END_OF = 'end_of_';

export function parseChordPro(text: string): Song {
  const song = emptySong();
  let subtitle = '';
  let section: Section | null = null;
  let inEnvironment = false;
  let verseCount = 0;
  let lastChorus: string | null = null;
  // Sections started by a {comment:} heading rather than an environment.
  const headings = new Set<Section>();

  const startSection = (name: string): Section => {
    const started: Section = { name, repeat: false, lines: [] };
    song.sections.push(started);
    return started;
  };

  for (const raw of text.replaceAll('\r\n', '\n').split('\n')) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith('#')) continue;
    if (trimmed.length === 0) {
      // A blank line ends a paragraph, but not an environment (where it's kept) or a heading still waiting
      // for its lines.
      if (inEnvironment && section !== null) section.lines.push({ text: '', chords: [] });
      else if (section !== null && section.lines.length > 0) section = null;
      continue;
    }

    const directive = DIRECTIVE.exec(trimmed);
    if (!directive) {
      section ??= startSection(`Verse ${++verseCount}`);
      section.lines.push(parseLyric(line));
      continue;
    }

    const name = directive[1]!.toLowerCase();
    let value = label(directive[2] ?? directive[3] ?? '');
    switch (name) {
      case 'title':
      case 't':
        song.title = value;
        break;
      case 'subtitle':
      case 'st':
        subtitle = value;
        break;
      case 'artist':
        song.artist = value;
        break;
      case 'key':
        song.key = value;
        break;
      case 'chorus':
        song.sections.push({ name: value.length > 0 ? value : (lastChorus ?? 'Chorus'), repeat: true, lines: [] });
        section = null;
        inEnvironment = false;
        break;
      default:
        if (COMMENT_DIRECTIVES.has(name)) {
          if (inEnvironment && section !== null) {
            section.lines.push({ text: value, chords: [] });
          } else {
            section = startSection(value);
            headings.add(section);
          }
          break;
        }
        const kind = environmentKind(name);
        if (kind === null && isEnvironmentEnd(name)) {
          section = null;
          inEnvironment = false;
        } else if (kind !== null) {
          // "{c: Chorus}" right before "{soc}" names the chorus rather than being a section of its own.
          if (value.length === 0 && section !== null && headings.has(section) && section.lines.length === 0) {
            value = section.name;
            song.sections.splice(song.sections.indexOf(section), 1);
            headings.delete(section);
          }
          if (kind === 'verse') verseCount++;
          const sectionName = value.length > 0 ? value : defaultName(kind, verseCount);
          if (kind === 'chorus') lastChorus = sectionName;
          section = startSection(sectionName);
          inEnvironment = true;
        }
        break;
    }
  }

  if (song.artist.length === 0) song.artist = subtitle;

  for (const heading of headings) {
    if (heading.lines.length > 0) continue;
    // A bare heading naming an earlier section means "play it again".
    const index = song.sections.indexOf(heading);
    heading.repeat = song.sections.slice(0, index).some((s) => !s.repeat && s.name === heading.name);
  }

  // Every section needs a line to type into.
  for (const s of song.sections) {
    if (s.lines.length === 0 && !s.repeat) s.lines.push({ text: '', chords: [] });
  }
  return song;
}

/**
 * Splits "[G]Amazing [D]grace" into lyrics and chord positions. Bracketed text that isn't a chord
 * (e.g. "[N.C.]") stays in the lyrics, so it isn't lost.
 */
export function parseLyric(text: string): SongLine {
  const line: SongLine = { text: '', chords: [] };
  let lyric = '';
  let taken = 0;
  for (const match of text.matchAll(BRACKETED)) {
    lyric += text.slice(taken, match.index);
    taken = match.index + match[0].length;
    const chord = match[1]!.trim();
    if (isChord(chord)) line.chords.push({ position: lyric.length, name: chord });
    else lyric += match[0];
  }
  lyric += text.slice(taken);
  line.text = lyric.trimEnd();
  return line;
}

const label = (value: string): string => (LABEL.exec(value.trim())?.[1] ?? value).trim();

/** "verse" for start_of_verse or sov, …; null if the directive doesn't start a section. */
function environmentKind(directive: string): string | null {
  const short = SHORT_ENVIRONMENTS.get(directive);
  if (short !== undefined) return short;
  if (directive.startsWith(START_OF) && directive.length > START_OF.length) return directive.slice(START_OF.length);
  return null;
}

const isEnvironmentEnd = (directive: string): boolean =>
  SHORT_ENVIRONMENT_ENDS.has(directive) || directive.startsWith(END_OF);

const defaultName = (kind: string, verseCount: number): string =>
  kind === 'verse' ? `Verse ${verseCount}` : kind[0]!.toUpperCase() + kind.slice(1);

/**
 * Writes a song in the ChordPro format: {title:}/{artist:}/{key:} directives, sections as
 * start_of_…/end_of_… environments, and each chord in brackets just before the letter it belongs to.
 */
export function songToChordPro(song: Song): string {
  const out: string[] = [];
  if (song.title.length > 0) out.push(`{title: ${song.title}}`);
  if (song.artist.length > 0) out.push(`{artist: ${song.artist}}`);
  if (song.key.length > 0) out.push(`{key: ${song.key}}`);

  for (const section of song.sections) {
    if (section.repeat) {
      if (out.length > 0) out.push('');
      // ChordPro can only recall a chorus; other repeats are a heading with nothing under it.
      out.push(isChorus(section.name) ? `{chorus: ${section.name}}` : `{comment: ${section.name}}`);
      continue;
    }

    // Every section and line is written, empty ones too (a blank line in an environment), so the song reads
    // back as it was.
    if (out.length > 0) out.push('');
    const environment = environmentOf(section.name);
    out.push(`{start_of_${environment}: ${section.name}}`);
    for (const line of section.lines) out.push(inlineChords(line));
    out.push(`{end_of_${environment}}`);
  }
  return out.map((line) => line + '\n').join('');
}

/** The lyric with each chord inserted as "[G]" at its position; chords past the end are padded out. */
export function inlineChords(line: SongLine): string {
  let text = '';
  let column = 0; // lyric characters written so far (brackets don't count)
  for (const chord of [...line.chords].sort((a, b) => a.position - b.position)) {
    const lyricEnd = Math.min(chord.position, line.text.length);
    if (lyricEnd > column) {
      text += line.text.slice(column, lyricEnd);
      column = lyricEnd;
    }
    if (chord.position > column) {
      text += ' '.repeat(chord.position - column);
      column = chord.position;
    }
    text += `[${chord.name}]`;
  }
  if (column < line.text.length) text += line.text.slice(column);
  return text.trimEnd();
}

const isChorus = (name: string): boolean => name.toLowerCase().startsWith('chorus');

const environmentOf = (name: string): string =>
  isChorus(name) ? 'chorus' : name.toLowerCase().startsWith('bridge') ? 'bridge' : 'verse';
