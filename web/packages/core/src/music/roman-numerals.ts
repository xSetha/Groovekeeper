// Writes a chord as a Roman numeral relative to a key: uppercase for major, lowercase for minor,
// ° for diminished, + for augmented ("Am7" in G → "ii7"). Chords outside the scale get a flat or sharp
// ("F" in G → "bVII"); minor keys are counted the same way from their tonic ("C" in Am → "bIII").
// A bass note is written as its scale degree ("G/B" in G → "I/3").
import { parseChord, triadOf } from './chord';
import { parseKey } from './keys';
import { mod12, pitchClass, type Note } from './note';

const NUMERALS = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
const DEGREES = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];

/** The numeral for `chord` in `key`, or null if either isn't valid. */
export function romanNumeral(chord: string, key: string): string | null {
  const parsed = parseChord(chord.trim());
  const parsedKey = parseKey(key);
  if (!parsed || !parsedKey) return null;
  const { tonic } = parsedKey;

  let numeral = NUMERALS[interval(tonic, parsed.root)]!;
  let rest = parsed.quality;
  switch (triadOf(parsed)) {
    case 'minor':
      numeral = numeral.toLowerCase();
      rest = stripPrefix(rest, 'min', 'm');
      break;
    case 'diminished':
      numeral = numeral.toLowerCase();
      // Half-diminished keeps its own sign; the others are written with °.
      if (rest.startsWith('ø')) break;
      rest = rest.startsWith('m7b5') ? 'ø7' + rest.slice('m7b5'.length) : '°' + stripPrefix(rest, 'dim', '°');
      break;
    case 'augmented':
      rest = '+' + stripPrefix(rest, 'aug', '+');
      break;
    case 'major':
      break;
  }

  const bass = parsed.bass ? '/' + DEGREES[interval(tonic, parsed.bass)]! : '';
  return numeral + rest + bass;
}

const interval = (tonic: Note, note: Note): number => mod12(pitchClass(note) - pitchClass(tonic));

function stripPrefix(text: string, ...prefixes: string[]): string {
  const prefix = prefixes.find((p) => text.startsWith(p));
  return prefix ? text.slice(prefix.length) : text;
}
