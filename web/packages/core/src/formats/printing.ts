// Rules for printed songs, the same as the desktop's PDF export (SongPdfWriter).
import type { Section, Song, SongLine } from '../models/song';
import { chordLine } from './song-text';

/** E.g. "[Key of E (+4 semitones from the original)]", or null when the song wasn't transposed. */
export function keyChangeNote(key: string, semitones: number): string | null {
  if (semitones === 0) return null;
  const unit = Math.abs(semitones) === 1 ? 'semitone' : 'semitones';
  return `[Key of ${key} (${semitones > 0 ? '+' : '−'}${Math.abs(semitones)} ${unit} from the original)]`;
}

/** The lines that are printed: blank lines are left out. */
export const printedLines = (section: Section): SongLine[] =>
  section.lines.filter((line) => line.text.trim().length > 0 || line.chords.length > 0);

/**
 * The indexes of the sections that are exact copies of an earlier section: the same name (ignoring case),
 * chords and lyrics. Blank lines and trailing spaces don't count, as they aren't printed.
 */
export function repeatedSections(song: Song): Set<number> {
  const seen = new Set<string>();
  const repeated = new Set<number>();
  song.sections.forEach((section, index) => {
    if (section.repeat) return;
    const lines = printedLines(section);
    if (lines.length === 0) return;
    // The name without case, then the lines exactly as printed: chord row and lyric row.
    const printed = `${section.name.trim().toUpperCase()}\n${lines.map((l) => `${chordLine(l)}\n${l.text.trimEnd()}`).join('\n')}`;
    if (seen.has(printed)) repeated.add(index);
    else seen.add(printed);
  });
  return repeated;
}
