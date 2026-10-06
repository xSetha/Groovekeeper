import { useRef, type ReactNode } from 'react';
import { addSongs } from '../library/library';
import { readSongFile, SONG_FILE_TYPES } from '../library/files';
import { toast } from '../toasts';

interface Props {
  className?: string;
  children: ReactNode;
  /** Called with the new songs' ids, in the order the files were picked. */
  onImported?: (ids: string[]) => void;
}

/** A button that adds .txt and ChordPro files to the library. The files themselves aren't changed. */
export function ImportSongs({ className, children, onImported }: Props) {
  const input = useRef<HTMLInputElement>(null);
  async function importFiles(files: File[]) {
    const read = await Promise.allSettled(files.map(async (file) => readSongFile(file.name, await file.text())));
    const failed = files.filter((_, i) => read[i]?.status === 'rejected');
    if (failed.length > 0) {
      toast('error', `Couldn't read ${failed.map((f) => f.name).join(', ')}`, 'Check that the file is still there, then import it again.');
      return;
    }
    try {
      const ids = await addSongs(read.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])));
      toast('success', ids.length === 1 ? 'Imported 1 song' : `Imported ${ids.length} songs`);
      onImported?.(ids);
    } catch {
      toast('error', "Couldn't add the songs to the library", 'Reload the page and import them again.');
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
