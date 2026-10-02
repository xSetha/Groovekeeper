// The public-domain sample songs in samples/songs, which the desktop app's seed script uses too.
import type { Song } from '@groovekeeper/core';
import { readSongFile } from './files';

const files = import.meta.glob<string>('../../../../../samples/songs/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const sampleSongs = (): Song[] =>
  Object.entries(files).map(([path, text]) => readSongFile(path.slice(path.lastIndexOf('/') + 1), text));
