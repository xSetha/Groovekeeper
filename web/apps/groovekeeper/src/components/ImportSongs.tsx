import { useRef, useState, type ReactNode } from 'react';
import { addSongs } from '../library/library';
import { readSongFile, SONG_FILE_TYPES } from '../library/files';

interface Props {
  className?: string;
  children: ReactNode;
  /** Called with the new songs' ids, in the order the files were picked. */
  onImported?: (ids: string[]) => void;
}

/** A button that adds .txt and ChordPro files to the library. The files themselves aren't changed. */
export function ImportSongs({ className, children, onImported }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function importFiles(files: File[]) {
    setError(null);
    const songs = [];
    for (const file of files) {
      try {
        songs.push(readSongFile(file.name, await file.text()));
      } catch {
        setError(`Couldn't read ${file.name}.`);
        return;
      }
    }
    onImported?.(await addSongs(songs));
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
      {error && (
        <p role="alert" className="text-sm text-chord">
          {error}
        </p>
      )}
    </>
  );
}
