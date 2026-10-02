/**
 * Whether the page was opened right after making what it shows (New song, New setlist), from the router's
 * location state. The state can be anything, so it's checked rather than assumed.
 */
export const isNewFrom = (state: unknown): boolean =>
  typeof state === 'object' && state !== null && 'isNew' in state && state.isNew === true;
