import { transposeChordName } from '../music/chord';
import { keyUsesFlats, transposeKey } from '../music/keys';

/**
 * A chord anchored above a character index of a lyric line.
 * The position may exceed the text length (chord-only lines).
 */
export interface ChordPlacement {
  position: number;
  name: string;
}

export interface SongLine {
  text: string;
  chords: ChordPlacement[];
}

export interface Section {
  name: string;
  /** A marker saying "play [name] again": it has no lines of its own. */
  repeat: boolean;
  lines: SongLine[];
}

export interface Song {
  title: string;
  artist: string;
  key: string;
  sections: Section[];
}

/** What a song without a title is called. */
export const UNTITLED_TITLE = 'Untitled song';

export const displayTitle = (song: Song): string => (song.title.length > 0 ? song.title : UNTITLED_TITLE);

export const emptySong = (): Song => ({ title: '', artist: '', key: '', sections: [] });

export const hasContent = (song: Song): boolean =>
  song.title.length > 0 || song.artist.length > 0 ||
  song.sections.some((s) => s.lines.some((l) => l.text.length > 0 || l.chords.length > 0));

/** A blank song with the usual section layout, each section holding one empty line. */
export const createTemplate = (): Song => ({
  ...emptySong(),
  sections: ['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Bridge', 'Outro'].map((name) => ({
    name,
    repeat: false,
    lines: [{ text: '', chords: [] }],
  })),
});

/**
 * The song moved by some semitones. The key gets its usual name, and every chord is spelled with that
 * key's sharps or flats (so going up and back down returns the same names). Without a key, chords keep
 * their own spelling.
 */
export function transposeSong(song: Song, semitones: number): Song {
  const key = transposeKey(song.key, semitones);
  const useFlats = keyUsesFlats(key);
  return {
    ...song,
    key,
    sections: song.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => ({
        ...line,
        chords: line.chords.map((chord) => ({ ...chord, name: transposeChordName(chord.name, semitones, useFlats) })),
      })),
    })),
  };
}
