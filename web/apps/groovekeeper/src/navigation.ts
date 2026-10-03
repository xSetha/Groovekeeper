import { createTemplate } from '@groovekeeper/core';
import { useNavigate } from 'react-router';
import { addSongs } from './library/library';

/**
 * Whether the page was opened right after making what it shows (New song, New setlist), from the router's
 * location state. The state can be anything, so it's checked rather than assumed.
 */
export const isNewFrom = (state: unknown): boolean =>
  typeof state === 'object' && state !== null && 'isNew' in state && state.isNew === true;

/** New song: a song from the template, added to the library and opened in the editor, marked as just made. */
export function useNewSong(): () => void {
  const navigate = useNavigate();
  return () => {
    void addSongs([createTemplate()]).then(([id]) => navigate(`/songs/${id}`, { state: { isNew: true } }));
  };
}
