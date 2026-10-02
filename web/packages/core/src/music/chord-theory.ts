// Chord lists for the chord palette: the chords that fit a key, what usually comes next, and every chord type for a root.
import { parseChord, triadOf } from './chord';
import { keyUsesFlats, parseKey } from './keys';
import { noteFromPitch, noteToString, pitchClass } from './note';

// [semitones above the tonic, chord quality]: the seven scale chords, then the dominant seventh.
const MAJOR_DEGREES: readonly [number, string][] =
  [[0, ''], [2, 'm'], [4, 'm'], [5, ''], [7, ''], [9, 'm'], [11, 'dim'], [7, '7']];
const MINOR_DEGREES: readonly [number, string][] =
  [[0, 'm'], [2, 'dim'], [3, ''], [5, 'm'], [7, 'm'], [8, ''], [10, ''], [7, '7']];

// After each chord of diatonicChords (by index), the chords of the key that commonly follow it.
const MAJOR_NEXT = [[3, 4, 5, 1], [4, 7, 3], [5, 3], [4, 0, 1, 7], [0, 5, 3], [3, 1, 4], [0, 2], [0, 5]];
const MINOR_NEXT = [[3, 5, 6, 4], [7, 0], [5, 3, 6], [7, 0, 6], [0, 5], [6, 3, 2], [2, 0, 5], [0, 5]];

/** The roots offered by the palette, in their most common spelling. */
export const PALETTE_ROOTS: readonly string[] = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** The chord types offered for each root ("" is the major triad). */
export const PALETTE_QUALITIES: readonly string[] =
  ['', 'm', '7', 'm7', 'maj7', '6', '9', 'sus2', 'sus4', 'add9', 'dim', 'aug'];

/** The chords built on a key's scale (e.g. G → G Am Bm C D Em F#dim D7), or none for an unknown key. */
export function diatonicChords(key: string): string[] {
  const parsed = parseKey(key);
  if (!parsed) return [];
  const useFlats = keyUsesFlats(key) === true;
  return (parsed.minor ? MINOR_DEGREES : MAJOR_DEGREES).map(
    ([offset, quality]) => noteToString(noteFromPitch(pitchClass(parsed.tonic) + offset, useFlats)) + quality,
  );
}

/**
 * Whether a chord is built on the key's scale: its root is a scale note and its triad matches
 * (extensions don't matter, so Am7 fits G). In a minor key the major V (E in Am) fits too.
 */
export const fitsKey = (chord: string, key: string): boolean => degreeIn(chord, key) >= 0;

/** The chords that commonly follow `chord` in the key, or none if it isn't in the key. */
export function suggestNext(chord: string, key: string): string[] {
  const degree = degreeIn(chord, key);
  if (degree < 0) return [];
  const chords = diatonicChords(key);
  const minor = key.trim().endsWith('m');
  return (minor ? MINOR_NEXT : MAJOR_NEXT)[degree]!.map((index) => chords[index]!);
}

/** The key's tonic as spelled in {@link PALETTE_ROOTS} (e.g. "A#m" → "Bb"), or null for an unknown key. */
export function rootOf(key: string): string | null {
  const parsed = parseKey(key);
  return parsed ? PALETTE_ROOTS[pitchClass(parsed.tonic)]! : null;
}

/** Index of the chord in diatonicChords by root and triad, or -1. */
function degreeIn(chord: string, key: string): number {
  const parsed = parseChord(chord.trim());
  if (!parsed || !parseKey(key)) return -1;
  return diatonicChords(key).findIndex((name) => {
    const scaleChord = parseChord(name);
    return scaleChord !== null &&
      pitchClass(scaleChord.root) === pitchClass(parsed.root) && triadOf(scaleChord) === triadOf(parsed);
  });
}
