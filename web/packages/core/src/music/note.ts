/** A spelled note name: a letter plus an optional sharp or flat ("F#", "Bb", "E#"). */
export interface Note {
  readonly letter: string;
  /** 1 for a sharp, -1 for a flat, 0 for neither. */
  readonly accidental: number;
}

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER_PITCHES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const mod12 = (value: number): number => ((value % 12) + 12) % 12;

/** 0 = C … 11 = B. Rare spellings are handled too: E# = F, Cb = B. */
export const pitchClass = (note: Note): number => mod12(LETTER_PITCHES[note.letter]! + note.accidental);

export const isFlat = (note: Note): boolean => note.accidental < 0;

/** Reads a note name that is already known to be valid, such as a regex match. */
export const parseNote = (text: string): Note => ({
  letter: text[0]!,
  accidental: text.length > 1 ? (text[1] === '#' ? 1 : -1) : 0,
});

/** The usual name for a pitch, with sharps or flats (never E#, B#, Fb or Cb). */
export const noteFromPitch = (pitch: number, useFlats: boolean): Note =>
  parseNote((useFlats ? FLATS : SHARPS)[mod12(pitch)]!);

export const transposeNote = (note: Note, semitones: number, useFlats: boolean): Note =>
  noteFromPitch(pitchClass(note) + semitones, useFlats);

export const noteToString = (note: Note): string =>
  note.letter + (note.accidental > 0 ? '#' : note.accidental < 0 ? 'b' : '');
