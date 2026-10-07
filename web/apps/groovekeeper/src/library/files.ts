// Song files: .txt (chords on the line above the lyrics) and ChordPro, as in the desktop app's SongFile.
import { displayTitle, parseChordPro, parseSongText, songToChordPro, songToText, type Song } from '@groovekeeper/core';

export const CHORDPRO_EXTENSIONS = ['.cho', '.chopro', '.chordpro', '.pro'];

/** Song files, by extension. */
export const SONG_EXTENSIONS = ['.txt', ...CHORDPRO_EXTENSIONS];

/** What the file picker offers when importing: song files, and a library exported as a zip. */
export const SONG_FILE_TYPES = [...SONG_EXTENSIONS, '.zip'].join(',');

export type SongFormat = 'text' | 'chordpro';

export const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase();
};

const formatOf = (fileName: string): SongFormat =>
  CHORDPRO_EXTENSIONS.includes(extensionOf(fileName)) ? 'chordpro' : 'text';

/** Reads a song file in the format its extension names; a song without a title is named after the file. */
export function readSongFile(fileName: string, text: string): Song {
  const song = formatOf(fileName) === 'chordpro' ? parseChordPro(text) : parseSongText(text);
  if (song.title.length === 0) {
    const extension = extensionOf(fileName);
    song.title = extension ? fileName.slice(0, -extension.length) : fileName;
  }
  return song;
}

const FORMATS: Record<SongFormat, { extension: string; write: (song: Song) => string }> = {
  text: { extension: '.txt', write: songToText },
  chordpro: { extension: '.cho', write: songToChordPro },
};

// Characters Windows doesn't allow in file names, plus control characters.
const UNSAFE_FILE_NAME = /[<>:"/\\|?*\u0000-\u001f]/g;

/** The file a song is saved to: its title as the name, with the format's extension. */
export function songFile(song: Song, format: SongFormat): { name: string; text: string } {
  const name = displayTitle(song).replace(UNSAFE_FILE_NAME, '').trim() || 'song';
  return { name: name + FORMATS[format].extension, text: FORMATS[format].write(song) };
}

/** Lets the browser save `content` as a file named `fileName`. */
export function download(fileName: string, content: string | Uint8Array<ArrayBuffer>, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
