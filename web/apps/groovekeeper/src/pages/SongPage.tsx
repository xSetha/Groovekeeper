import { displayTitle, transposeSong, type Song } from '@groovekeeper/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LibraryPanel } from '../components/LibraryPanel';
import { SongSheet } from '../components/SongSheet';
import { download, songFile, type SongFormat } from '../library/files';
import { deleteSong, getSong, saveSong } from '../library/library';

export function SongPage() {
  const { id = '' } = useParams();
  // null while loading, undefined when the library has no such song
  const song = useLiveQuery(() => getSong(id), [id], null);

  return (
    <div className="flex min-h-0 flex-1">
      <LibraryPanel activeId={id} className="hidden w-72 shrink-0 border-r border-line p-4 md:flex" />
      <main className="flex min-w-0 flex-1 flex-col">
        {song === undefined && <NotFound />}
        {song && <SongView id={id} song={song} />}
      </main>
    </div>
  );
}

function SongView({ id, song }: { id: string; song: Song }) {
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    document.title = `${displayTitle(song)} – Groovekeeper`;
  }, [song]);

  const transpose = (semitones: number) => void saveSong(id, transposeSong(song, semitones));
  const save = (format: SongFormat) => {
    const file = songFile(song, format);
    download(file.name, file.text);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-line bg-toolbar px-4 py-1.5 text-sm">
        <Link to="/" className="py-1.5 text-muted hover:text-fg md:hidden">
          ← Library
        </Link>
        <span className="flex items-center gap-1">
          <span className="text-muted">Transpose</span>
          <ToolButton label="Transpose down" onClick={() => transpose(-1)}>−</ToolButton>
          <ToolButton label="Transpose up" onClick={() => transpose(1)}>+</ToolButton>
        </span>
        <span>
          <span className="text-muted">Key </span>
          <span className="font-semibold" data-testid="song-key">{song.key || '–'}</span>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <ToolButton onClick={() => save('text')}>Save as .txt</ToolButton>
          <ToolButton onClick={() => save('chordpro')}>Save as ChordPro</ToolButton>
          <ToolButton onClick={() => setConfirmDelete(true)}>Delete</ToolButton>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-8 sm:px-10">
        <SongSheet song={song} />
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete “${displayTitle(song)}”?`}
          message="The song is removed from the library in this browser. This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void deleteSong(id).then(() => navigate('/'))}
        />
      )}
    </>
  );
}

function ToolButton({ label, onClick, children }: { label?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="rounded px-2 py-1.5 hover:bg-hover">
      {children}
    </button>
  );
}

function NotFound() {
  return (
    <div className="p-10">
      <p>This song isn't in your library.</p>
      <Link to="/" className="mt-2 inline-block text-accent hover:underline">
        Back to the library
      </Link>
    </div>
  );
}
