import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ImportSongs } from '../components/ImportSongs';
import { LibraryPanel } from '../components/LibraryPanel';
import { Logo } from '../components/TopBar';
import { db } from '../library/db';
import { addSongs } from '../library/library';
import { sampleSongs } from '../library/samples';
import { useNewSong } from '../navigation';
import { useIsPhone } from '../phone';
import { useAccount } from '../sync/account';
import { toast } from '../toasts';

export function StartPage() {
  const navigate = useNavigate();
  const newSong = useNewSong();
  const songCount = useLiveQuery(() => db.songs.count());
  const phone = useIsPhone();
  const signedIn = useAccount((s) => s.status === 'signedIn');
  const openFirst = (ids: string[]) => ids.length === 1 && navigate(`/songs/${ids[0]}`);

  useEffect(() => {
    document.title = 'Groovekeeper';
  }, []);

  // Until songs sync from another device, the sample songs are the way to try the app with a few songs.
  const samples = (
    <>
      {songCount === 0 ? (
        <button
          type="button"
          className="rounded px-5 py-2.5 font-semibold hover:bg-hover pointer-coarse:min-h-11"
          onClick={() => {
            addSongs(sampleSongs()).then(
              (ids) => toast('success', `Added ${ids.length} sample songs`),
              () => toast('error', "Couldn't add the sample songs", 'Reload the page and try again.'),
            );
          }}
        >
          Try the sample songs
        </button>
      ) : null}
    </>
  );

  if (phone) {
    // On a phone the start page is the library: songs are read here and written on a bigger screen.
    return (
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <LibraryPanel canImport={false} className="min-h-0 flex-1" />
        {samples}
      </main>
    );
  }

  return (
    <main className="relative min-h-0 flex-1 overflow-y-auto">
      {/* The theme's photo, dimmed under the window color so the text stays readable (index.css). */}
      <div className="pointer-events-none absolute inset-0 bg-(image:--start-photo) bg-cover bg-center" />
      <div className="pointer-events-none absolute inset-0 bg-window opacity-(--start-dim)" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 sm:px-8 lg:min-h-full lg:grid-cols-[1fr_22rem]">
        <section>
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-xl bg-logo-tile">
              <Logo className="size-9" />
            </span>
            <h1 className="text-4xl font-bold sm:text-5xl">Groovekeeper</h1>
          </div>
          <p className="mt-4 max-w-md text-lg text-muted sm:text-xl">
            Write your lyrics, then put each chord exactly on the syllable where it changes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded bg-accent-fill px-5 py-2.5 font-semibold text-on-accent hover:brightness-125 pointer-coarse:min-h-11"
              onClick={newSong}
            >
              New song
            </button>
            <ImportSongs
              className="rounded px-5 py-2.5 font-semibold hover:bg-hover pointer-coarse:min-h-11"
              onImported={openFirst}
            >
              Import songs…
            </ImportSongs>
            {samples}
          </div>
          <p className="mt-6 max-w-md text-sm text-muted">
            Write a new song, or import <code>.txt</code> and ChordPro files.
            {signedIn ? ' Your songs are kept in your account and on every device you sign in on.' : null}
          </p>
        </section>

        <LibraryPanel className="h-[28rem] rounded-lg border border-line bg-card p-5 shadow-2xl" />
      </div>
    </main>
  );
}
