// Rules for printed songs, the same as the desktop's PDF export (SongPdfWriter).
import type { Section, Song, SongLine } from '../models/song';
import { chordLine } from './song-text';

/** The lines with something on them; blank lines don't count when comparing sections. */
const contentLines = (section: Section): SongLine[] =>
  section.lines.filter((line) => line.text.trim().length > 0 || line.chords.length > 0);

/**
 * The indexes of the sections that are exact copies of an earlier section: the same name (ignoring case),
 * chords and lyrics. Blank lines and trailing spaces don't count.
 */
export function repeatedSections(song: Song): Set<number> {
  const seen = new Set<string>();
  const repeated = new Set<number>();
  song.sections.forEach((section, index) => {
    if (section.repeat) return;
    const lines = contentLines(section);
    if (lines.length === 0) return;
    // The name without case, then the lines with something on them: chord row and lyric row.
    const printed = `${section.name.trim().toUpperCase()}\n${lines.map((l) => `${chordLine(l)}\n${l.text.trimEnd()}`).join('\n')}`;
    if (seen.has(printed)) repeated.add(index);
    else seen.add(printed);
  });
  return repeated;
}
