// What isn't saved yet when the page is hidden or about to reload (the song being edited, a setlist's name).
// A reload for a new version waits for it, and doesn't happen when a save failed, so it never loses a change.
import { db } from './library/db';

const savers = new Set<() => Promise<boolean>>();

/**
 * Saves what's waiting when the page is hidden (a phone may close it) and before it reloads. `save` resolves
 * to whether it worked. Returns the function that stops it, after which the caller saves on its own.
 */
export function saveBeforeLeaving(save: () => Promise<boolean>): () => void {
  const onPageHide = () => void save();
  savers.add(save);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    savers.delete(save);
    window.removeEventListener('pagehide', onPageHide);
  };
}

/**
 * Saves everything that's waiting, and waits for saves already under way (IndexedDB runs this empty
 * transaction after every write to the same tables started before it). False when a save failed.
 */
export async function saveAll(): Promise<boolean> {
  const saved = await Promise.all([...savers].map((save) => save().catch(() => false)));
  await db.transaction('rw', db.songs, db.setlists, () => {}).catch(() => undefined);
  return saved.every(Boolean);
}
