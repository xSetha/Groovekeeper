import { songToText } from '@groovekeeper/core';
import { useRef, type ReactNode } from 'react';
import { importZip as importLibraryZip } from '../library/backup';
import { extensionOf, readSongFile, SONG_FILE_TYPES } from '../library/files';
import { addSongs } from '../library/library';
import { LIMITS, sizeProblem, toastFailure } from '../library/limits';
import { toast } from '../toasts';

interface Props {
  className?: string;
  children: ReactNode;
  /** Called with the new songs' ids, in the order the files were picked. */
  onImported?: (ids: string[]) => void;
}

const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${n} ${one}s`);

/** Says which songs were too long to import; they aren't added, the others are. */
function tooLongToImport(names: string[]): void {
  if (names.length === 0) return;
  toast(
    'error',
    `Didn't import ${names.join(', ')}`,
    `A song can have up to ${LIMITS.songText.toLocaleString('en')} characters, and its title up to ${LIMITS.titles}. Shorten ${names.length === 1 ? 'it' : 'them'} in another app, then import again.`,
  );
}

/**
 * A button that adds .txt and ChordPro files to the library, or a zip: a library exported from this app (with
 * its notes and setlists) or any zip of song files. The files themselves aren't changed.
 */
export function ImportSongs({ className, children, onImported }: Props) {
  const input = useRef<HTMLInputElement>(null);

  async function importZip(file: File) {
    try {
      const imported = await importLibraryZip(new Uint8Array(await file.arrayBuffer()));
      tooLongToImport(imported.tooLong);
      const what = [plural(imported.ids.length, 'song'), ...(imported.setlists > 0 ? [plural(imported.setlists, 'setlist')] : [])];
      toast(
        'success',
        `Imported ${what.join(' and ')}`,
        imported.skipped > 0 ? `${plural(imported.skipped, 'song')} ${imported.skipped === 1 ? 'was' : 'were'} already in the library.` : '',
      );
      if (imported.ids.length > 0) onImported?.(imported.ids);
    } catch (error) {
      toastFailure(error, `Couldn't import ${file.name}`, 'Check that it’s a library exported from Groovekeeper, or a zip of song files.');
    }
  }

  async function importFiles(files: File[]) {
    for (const zip of files.filter((file) => extensionOf(file.name) === '.zip')) await importZip(zip);
    files = files.filter((file) => extensionOf(file.name) !== '.zip');
    if (files.length === 0) return;
    const read = await Promise.allSettled(files.map(async (file) => readSongFile(file.name, await file.text())));
    const failed = files.filter((_, i) => read[i]?.status === 'rejected');
    if (failed.length > 0) {
      toast('error', `Couldn't read ${failed.map((f) => f.name).join(', ')}`, 'Check that the file is still there, then import it again.');
      return;
    }
    const songs = read.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    // A song too long to keep isn't added; the others are.
    tooLongToImport(files.filter((_, i) => songs[i] && sizeProblem(songs[i], songToText(songs[i]), []) !== null).map((f) => f.name));
    const kept = songs.filter((song) => sizeProblem(song, songToText(song), []) === null);
    if (kept.length === 0) return;
    try {
      const ids = await addSongs(kept);
      toast('success', `Imported ${plural(ids.length, 'song')}`);
      onImported?.(ids);
    } catch (error) {
      toastFailure(error, "Couldn't add the songs to the library", 'Reload the page and import them again.');
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={SONG_FILE_TYPES}
        hidden
        data-testid="import-files"
        onChange={(event) => {
          // Copied before clearing the input, which empties its file list.
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          if (files.length > 0) void importFiles(files);
        }}
      />
    </>
  );
}
