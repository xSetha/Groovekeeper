// How a chord is shown: its letters, in Do Re Mi, or as a Roman numeral in the song's key. Songs always keep
// letters; this is only what's displayed. The same choice as the desktop app's chord style.
import { toSolfege } from './note-names';
import { romanNumeral } from './roman-numerals';

export type ChordStyle = 'letters' | 'solfege' | 'numerals';

/** A key ("Am") as `style` shows it: in Do Re Mi when the chords are, otherwise as it is. */
export const showKey = (key: string, style: ChordStyle): string => (style === 'solfege' ? toSolfege(key) : key);

/** The chord as `style` shows it. A Roman numeral needs a valid key: without one the chord keeps its letters. */
export function showChord(name: string, style: ChordStyle, key: string): string {
  if (style === 'solfege') return toSolfege(name);
  if (style === 'numerals') return romanNumeral(name, key) ?? name;
  return name;
}
