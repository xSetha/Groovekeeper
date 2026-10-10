// Do Re Mi Fa Sol La Si for C D E F G A B (fixed do). Songs always keep letters; this is only how chords are shown
// and a second way to type them: "Lam7/Sol" is "Am7/G". Only the root and the bass change, and the accidental
// follows the name ("Fa#", "Sib"). The same rule as the desktop app's NoteNames, pinned by shared/fixtures.
import { isChord, parseChord } from './chord';
import type { Note } from './note';

/** How chord names are written: with letters (A B C) or with Do Re Mi. */
export type ChordNaming = 'letters' | 'solfege';

const SOLFEGE: Record<string, string> = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const LETTER_OF: Record<string, string> = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };

// The names without accents; "Ré" is accepted too when typing. The accidental (# or b) is read after the name.
const NOTE_NAME = /^(do|re|ré|mi|fa|sol|la|si)(.*)$/i;
const LETTER_NOTE = /^[A-G][#b]?$/;

const accidental = (note: Note): string => (note.accidental > 0 ? '#' : note.accidental < 0 ? 'b' : '');
const solfegeNote = (note: Note): string => SOLFEGE[note.letter]! + accidental(note);

/** A letter chord (or key, "Am") written in Do Re Mi. Anything that isn't a chord is returned as it is. */
export function toSolfege(chord: string): string {
  const parsed = parseChord(chord.trim());
  if (!parsed) return chord;
  return solfegeNote(parsed.root) + parsed.quality + (parsed.bass ? '/' + solfegeNote(parsed.bass) : '');
}

/** A solfège note name read as its letter ("RÉ#" → "D#"), with what follows it. Null if it doesn't start with one. */
function noteAndRest(text: string): { letter: string; rest: string } | null {
  const match = NOTE_NAME.exec(text);
  if (!match) return null;
  const letter = LETTER_OF[match[1]!.toLowerCase().replace('é', 'e')]!;
  const rest = match[2]!;
  return rest.startsWith('#') || rest.startsWith('b') ? { letter: letter + rest[0], rest: rest.slice(1) } : { letter, rest };
}

// A bass note is a solfège name ("Re", "Sol#") or already a letter ("G").
function bassFrom(text: string): string | null {
  const note = noteAndRest(text);
  if (note) return note.rest === '' ? note.letter : null;
  return LETTER_NOTE.test(text) ? text : null;
}

/**
 * A chord typed in Do Re Mi ("sol7", "Lam", "Sib/Re") as its letter chord ("G7", "Am", "Bb/D"), or null if it isn't
 * one. Letter chords are not solfège, so they give null: try {@link isChord} first. Chord files are never read this
 * way: "Do", "La" and "Si" are common words in lyrics.
 */
export function fromSolfege(text: string): string | null {
  const note = noteAndRest(text.trim());
  if (!note) return null;
  const slash = note.rest.indexOf('/');
  let quality = note.rest;
  let bass = '';
  if (slash >= 0) {
    quality = note.rest.slice(0, slash);
    const bassNote = bassFrom(note.rest.slice(slash + 1));
    if (bassNote === null) return null;
    bass = '/' + bassNote;
  }
  const chord = note.letter + quality + bass;
  return isChord(chord) ? chord : null;
}

/** What a person typed as a chord, as the letter chord to keep: letters as they are, Do Re Mi turned into letters, null if neither. */
export function normalizeChord(text: string): string | null {
  const trimmed = text.trim();
  return isChord(trimmed) ? trimmed : fromSolfege(text);
}

/** The chord as it is shown in the given naming. */
export const displayChord = (chord: string, naming: ChordNaming): string => (naming === 'solfege' ? toSolfege(chord) : chord);
