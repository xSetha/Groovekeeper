import { isFlat, mod12, parseNote, pitchClass, type Note } from './note';

const ROOTS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

// The name a key gets after transposing, per pitch class: the spelling most songbooks use.
const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

// Keys without a flat in their name whose scales are still written with flats.
const NATURAL_FLAT_KEYS = new Set(['F', 'Dm', 'Gm', 'Cm', 'Fm']);

/** Every major and minor key, paired per root (C, Cm, C#, C#m, ...), with both sharp and flat spellings. */
export const ALL_KEYS: readonly string[] = ROOTS.flatMap((root) => [root, root + 'm']);

/** Reads a key from {@link ALL_KEYS} (e.g. "Bbm" → Bb, minor), or null for an unknown key. */
export function parseKey(key: string): { tonic: Note; minor: boolean } | null {
  key = key.trim();
  if (!ALL_KEYS.includes(key)) return null;
  const minor = key.endsWith('m');
  return { tonic: parseNote(minor ? key.slice(0, -1) : key), minor };
}

/** Whether a key's scale is written with flats; null for an unknown key. */
export function keyUsesFlats(key: string): boolean | null {
  const parsed = parseKey(key);
  return parsed ? isFlat(parsed.tonic) || NATURAL_FLAT_KEYS.has(key.trim()) : null;
}

/** Moves a key by some semitones and gives it its usual name (C + 1 → Db). Unknown keys are unchanged. */
export function transposeKey(key: string, semitones: number): string {
  const parsed = parseKey(key);
  if (!parsed) return key;
  const pitch = mod12(pitchClass(parsed.tonic) + semitones);
  return (parsed.minor ? MINOR_NAMES : MAJOR_NAMES)[pitch]!;
}
