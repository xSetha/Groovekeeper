// What one account may keep, the same numbers as the database (web/supabase/migrations/20261007120000):
// the app keeps to them, so a song never fails only when it syncs. Guests keep their songs in the browser,
// where the sizes apply too (a guest's library may join an account), but not the counts.
import { accountStore } from '../sync/account';
import { toast } from '../toasts';
import { db, type SongNote } from './db';

export const LIMITS = {
  /** Characters of a song's text, as stored (.txt). */
  songText: 20_000,
  notes: 50,
  /** Characters of a song's notes, together. */
  notesText: 5_000,
  songs: 200,
  setlists: 20,
  /** Characters of a song's title or artist, or a setlist's name. */
  titles: 500,
} as const;

/** Something the limits don't allow, said as the user sees it. */
export class LimitError extends Error {
  constructor(
    readonly title: string,
    readonly detail: string,
  ) {
    super(`${title} ${detail}`);
  }
}

const count = (n: number): string => n.toLocaleString('en');

/** Why a song this size can't be kept (its title and artist, stored text and notes), or null when it can. */
export function sizeProblem(
  song: { title: string; artist: string },
  text: string,
  notes: readonly SongNote[],
): string | null {
  if (song.title.length > LIMITS.titles) {
    return `Its title has ${count(song.title.length)} characters; a title can have up to ${LIMITS.titles}.`;
  }
  if (song.artist.length > LIMITS.titles) {
    return `Its artist has ${count(song.artist.length)} characters; an artist can have up to ${LIMITS.titles}.`;
  }
  if (text.length > LIMITS.songText) {
    return `It has ${count(text.length)} characters; a song can have up to ${count(LIMITS.songText)}.`;
  }
  if (notes.length > LIMITS.notes) return `It has ${notes.length} notes; a song can have up to ${LIMITS.notes}.`;
  const noteText = notes.reduce((sum, note) => sum + note.text.length, 0);
  if (noteText > LIMITS.notesText) {
    return `Its notes have ${count(noteText)} characters; a song's notes can have up to ${count(LIMITS.notesText)}.`;
  }
  return null;
}

/** Throws a LimitError when a signed-in account can't take `adding` more songs or setlists. */
export async function checkRoom(kind: 'songs' | 'setlists', adding: number): Promise<void> {
  if (accountStore.getState().status !== 'signedIn') return;
  const limit = LIMITS[kind];
  const room = limit - (await db[kind].count());
  if (adding <= room) return;
  const noun = kind === 'songs' ? 'song' : 'setlist';
  throw new LimitError(
    `Your account holds up to ${limit} ${kind}`,
    room <= 0
      ? `Delete a ${noun} to add another.`
      : `There's room for ${room} more ${room === 1 ? noun : kind}; delete some to add all ${adding}.`,
  );
}

/** Shows what went wrong: a limit in its own words, anything else as `title` and `detail`. */
export function toastFailure(error: unknown, title: string, detail: string, key?: string): void {
  if (error instanceof LimitError) toast('error', error.title, error.detail, key);
  else toast('error', title, detail, key);
}
