// Guesses a song's key from its chords: the key whose scale fits the most chords,
// with a bonus when the song starts or ends on that key's tonic chord.
import { isChord, parseChord, triadOf } from './chord';
import { diatonicChords, fitsKey } from './chord-theory';
import { transposeKey } from './keys';
import { pitchClass } from './note';

// Below this share of chords fitting the best key, the song doesn't sound like any one key.
const MINIMUM_FIT = 0.6;
const TONIC_BONUS = 2;

// Every major key, then every minor key, each with its usual name; ties go to the first.
const CANDIDATES = [
  ...Array.from({ length: 12 }, (_, pitch) => transposeKey('C', pitch)),
  ...Array.from({ length: 12 }, (_, pitch) => transposeKey('Cm', pitch)),
];

/** The likely key (as named in ALL_KEYS), or null if there are no chords or no clear key. */
export function detectKey(chords: readonly string[]): string | null {
  const valid = chords.filter(isChord);
  if (valid.length === 0) return null;

  let best: string | null = null;
  let bestScore = 0;
  for (const key of CANDIDATES) {
    const fits = valid.filter((chord) => fitsKey(chord, key)).length;
    if (fits < valid.length * MINIMUM_FIT) continue;
    const score = fits +
      (isTonic(valid[0]!, key) ? TONIC_BONUS : 0) +
      (isTonic(valid[valid.length - 1]!, key) ? TONIC_BONUS : 0);
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}

function isTonic(chord: string, key: string): boolean {
  const parsed = parseChord(chord);
  const tonic = parseChord(diatonicChords(key)[0]!);
  return parsed !== null && tonic !== null &&
    pitchClass(parsed.root) === pitchClass(tonic.root) && triadOf(parsed) === triadOf(tonic);
}
