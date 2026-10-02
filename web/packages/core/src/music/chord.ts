import { isFlat, noteToString, parseNote, transposeNote, type Note } from './note';

export type Triad = 'major' | 'minor' | 'diminished' | 'augmented';

/**
 * A chord name split into root, chord type and optional bass note ("F#m7/C#" → F#, "m7", C#).
 * This is the single definition of a valid chord, used by the transposer, the file readers and the palette.
 */
export interface Chord {
  readonly root: Note;
  readonly quality: string;
  readonly bass: Note | null;
}

// Chord types are built from known parts so lyric words ("Every", "Day") are never taken for chords.
const CHORD_PATTERN =
  /^([A-G][#b]?)((?:maj|min|dim|aug|sus|add|m|M|\+|°|ø|\d|[#b]\d|\(|\))*)(?:\/([A-G][#b]?))?$/;

export function parseChord(text: string): Chord | null {
  const match = CHORD_PATTERN.exec(text);
  if (!match) return null;
  return {
    root: parseNote(match[1]!),
    quality: match[2]!,
    bass: match[3] !== undefined ? parseNote(match[3]) : null,
  };
}

export const isChord = (text: string): boolean => parseChord(text) !== null;

/** The basic triad the chord type starts from ("m7" → minor, "maj7" → major, "m7b5" → diminished). */
export function triadOf(chord: Chord): Triad {
  const q = chord.quality;
  if (q.startsWith('maj')) return 'major';
  if (q.startsWith('dim') || q.startsWith('°') || q.startsWith('ø') || q.includes('b5')) return 'diminished';
  if (q.startsWith('aug') || q.startsWith('+')) return 'augmented';
  if (q.startsWith('m')) return 'minor';
  return 'major';
}

/**
 * Moves the root and the bass by `semitones`. The notes are spelled with flats or sharps as `useFlats`
 * says; when it is null, each note keeps its own kind of accidental.
 */
export const transposeChord = (chord: Chord, semitones: number, useFlats: boolean | null): Chord => ({
  root: transposeNote(chord.root, semitones, useFlats ?? isFlat(chord.root)),
  quality: chord.quality,
  bass: chord.bass ? transposeNote(chord.bass, semitones, useFlats ?? isFlat(chord.bass)) : null,
});

export const chordToString = (chord: Chord): string =>
  noteToString(chord.root) + chord.quality + (chord.bass ? '/' + noteToString(chord.bass) : '');

/**
 * Shifts a chord name such as "F#m7/C#" by some semitones (see {@link transposeChord}).
 * Text that is not a valid chord is returned unchanged.
 */
export function transposeChordName(name: string, semitones: number, useFlats: boolean | null = null): string {
  const chord = parseChord(name.trim());
  return chord ? chordToString(transposeChord(chord, semitones, useFlats)) : name;
}
