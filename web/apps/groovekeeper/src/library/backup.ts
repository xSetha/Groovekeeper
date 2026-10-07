// The whole library as one zip, and back. Every song is in it as a .txt file anyone can read (the desktop app
// imports them); library.json has what .txt files don't, the notes and the setlists, for this app to restore.
import { parseSongText, songToText, type Song } from '@groovekeeper/core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { db, type LibrarySetlist, type SongNote } from './db';
import { extensionOf, readSongFile, songFile, SONG_EXTENSIONS } from './files';
import { newId } from './ids';
import { addSongsWithNotes, listSongs } from './library';
import { checkRoom, sizeProblem } from './limits';
import { listSetlists } from './setlists';

const BACKUP = 'library.json';
const FORMAT = 'groovekeeper-library';

interface Backup {
  format: typeof FORMAT;
  version: 1;
  songs: { id: string; text: string; notes: SongNote[] }[];
  /** Each setlist's songs, in playing order, by their ids in `songs`. */
  setlists: { name: string; songs: string[] }[];
}

/** A file name not used yet in the zip (names are compared ignoring case, as Windows does). */
function unique(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const [base, extension] = dot < 0 ? [name, ''] : [name.slice(0, dot), name.slice(dot)];
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${extension}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

const today = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** The library as a zip: Songs/<title>.txt for every song, and library.json. */
export async function exportLibrary(): Promise<{ name: string; data: Uint8Array<ArrayBuffer>; songs: number; setlists: number }> {
  const [songs, setlists] = await Promise.all([listSongs(), listSetlists()]);
  const files: Record<string, Uint8Array> = {};
  const taken = new Set<string>();
  for (const song of songs) files[`Songs/${unique(songFile(parseSongText(song.text), 'text').name, taken)}`] = strToU8(song.text);
  const backup: Backup = {
    format: FORMAT,
    version: 1,
    songs: songs.map((song) => ({ id: song.id, text: song.text, notes: song.notes ?? [] })),
    setlists: setlists.map((setlist) => ({ name: setlist.name, songs: setlist.songs.map((entry) => entry.songId) })),
  };
  files[BACKUP] = strToU8(JSON.stringify(backup, null, 2));
  return { name: `Groovekeeper library ${today()}.zip`, data: zipSync(files) as Uint8Array<ArrayBuffer>, songs: songs.length, setlists: setlists.length };
}

/** What importing a zip did. */
export interface Imported {
  /** The songs added, in the order they were in the zip. */
  ids: string[];
  setlists: number;
  /** Songs already in the library, with the same text and notes: not added again. */
  skipped: number;
  /** Songs too long to keep, by title or file name: not added. */
  tooLong: string[];
}

/**
 * Adds a zip's songs to the library: a library exported from this app with its notes and setlists, or any
 * zip of song files. Throws a LimitError, adding nothing, when a signed-in account has no room for them.
 */
export async function importZip(data: Uint8Array): Promise<Imported> {
  const files = unzipSync(data);
  const backup = files[BACKUP];
  if (backup) return restore(JSON.parse(strFromU8(backup)) as Backup);

  const songs: Song[] = [];
  const tooLong: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    // Hidden files, such as the __MACOSX/._Song.txt copies a Mac adds to a zip, aren't songs.
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (!SONG_EXTENSIONS.includes(extensionOf(path)) || name.startsWith('.') || path.startsWith('__MACOSX/')) continue;
    const song = readSongFile(name, strFromU8(content));
    if (sizeProblem(song, songToText(song), [])) tooLong.push(path);
    else songs.push(song);
  }
  return { ids: await addSongsWithNotes(songs.map((song) => ({ song, notes: [] }))), setlists: 0, skipped: 0, tooLong };
}

/** Songs with the same text and notes are the same song. */
const contentKey = (text: string, notes: readonly SongNote[]): string => JSON.stringify([text, notes]);

async function restore(backup: Backup): Promise<Imported> {
  if (backup.format !== FORMAT || backup.version !== 1 || !Array.isArray(backup.songs)) {
    throw new Error('This zip isn’t a Groovekeeper library, or comes from a newer version of the app.');
  }
  const inLibrary = new Map((await db.songs.toArray()).map((song) => [contentKey(song.text, song.notes ?? []), song.id]));

  // Each song of the zip, read as the library keeps it; a song already in the library, or twice in the zip,
  // goes in once.
  const keyOf = new Map<string, string>();
  const adding = new Map<string, { song: Song; notes: SongNote[] }>();
  const tooLong: string[] = [];
  let skipped = 0;
  for (const entry of backup.songs) {
    const song = parseSongText(entry.text);
    const text = songToText(song);
    const notes = Array.isArray(entry.notes) ? entry.notes : [];
    const key = contentKey(text, notes);
    keyOf.set(entry.id, key);
    if (inLibrary.has(key)) skipped++;
    else if (adding.has(key)) continue;
    else if (sizeProblem(song, text, notes)) tooLong.push(song.title || entry.id);
    else adding.set(key, { song, notes });
  }

  // Setlists already here (same name, same songs) aren't added again. Only one made of songs already in the
  // library can be, so that's known before any song is added.
  const setlistKey = (name: string, songIds: string[]) => JSON.stringify([name, songIds]);
  const existing = new Set((await db.setlists.toArray()).map((s) => setlistKey(s.name, s.songs.map((e) => e.songId))));
  const inLibraryId = (zipId: string) => inLibrary.get(keyOf.get(zipId) ?? '');
  const setlists = (backup.setlists ?? []).filter((setlist) => {
    const ids = setlist.songs.map(inLibraryId);
    return !(ids.every((id) => id !== undefined) && existing.has(setlistKey(setlist.name, ids as string[])));
  });
  await checkRoom('setlists', setlists.length); // before any song is added, so a refusal adds nothing
  const ids = await addSongsWithNotes([...adding.values()]);
  const added = new Map([...adding.keys()].map((key, i) => [key, ids[i]!]));
  const idHere = (zipId: string): string | undefined => {
    const key = keyOf.get(zipId);
    return key === undefined ? undefined : (inLibrary.get(key) ?? added.get(key));
  };

  const restored: LibrarySetlist[] = [];
  for (const setlist of setlists) {
    const songIds = setlist.songs.flatMap((id) => idHere(id) ?? []);
    restored.push({
      id: newId(),
      name: setlist.name,
      songs: songIds.map((songId) => ({ id: newId(), songId })),
      updatedAt: Date.now(),
      version: 0,
      dirty: 1,
    });
  }
  await db.setlists.bulkAdd(restored);
  return { ids, setlists: restored.length, skipped, tooLong };
}
