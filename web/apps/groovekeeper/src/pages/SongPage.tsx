import type { Song } from '@groovekeeper/core';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { LibraryPanel } from '../components/LibraryPanel';
import { SongEditor } from '../editor/SongEditor';
import { getSong } from '../library/library';
import { useIsPhone } from '../phone';
import { SongReader } from './SongReader';

export function SongPage() {
  const { id = '' } = useParams();
  const phone = useIsPhone();
  // The song is read once when it's opened; from then on the editor holds it and saves it.
  const [loaded, setLoaded] = useState<{ id: string; song: Song | undefined } | null>(null);

  useEffect(() => {
    let current = true;
    void getSong(id).then((song) => current && setLoaded({ id, song }));
    return () => {
      current = false;
    };
  }, [id]);

  const ready = loaded?.id === id ? loaded : null;
  if (phone) {
    // On a phone, songs are read, not edited.
    return ready?.song ? <SongReader song={ready.song} /> : ready ? <NotFound /> : null;
  }
  return (
    <div className="flex min-h-0 flex-1">
      <LibraryPanel activeId={id} className="hidden w-72 shrink-0 border-r border-line p-4 md:flex" />
      <main className="flex min-w-0 flex-1 flex-col">
        {ready && !ready.song && <NotFound />}
        {ready?.song && <SongEditor key={id} id={id} initial={ready.song} />}
      </main>
    </div>
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
