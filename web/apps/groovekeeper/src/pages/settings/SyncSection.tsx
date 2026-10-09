import { UNTITLED_TITLE } from '@groovekeeper/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { ExportLibrary } from '../../components/ExportLibrary';
import { SECONDARY, syncStatusText } from '../../components/forms';
import { ImportSongs } from '../../components/ImportSongs';
import { db } from '../../library/db';
import { LIMITS } from '../../library/limits';
import { useIsPhone } from '../../phone';
import { runSync, useAccount } from '../../sync/account';
import { Group, SectionTitle } from './parts';

/** Settings → Sync and storage: how syncing stands, how much the account holds, and the library in one file. */
export function SyncSection() {
  const sync = useAccount((s) => s.sync);
  const lastSynced = useAccount((s) => s.lastSynced);
  const phone = useIsPhone();
  const library = useLiveQuery(async () => {
    const [songs, setlists, conflicts] = await Promise.all([db.songs.toArray(), db.setlists.toArray(), db.conflicts.count()]);
    return { songs, setlists, conflicts };
  }, []);

  const refusedSongs = library?.songs.filter((song) => song.refused) ?? [];
  const refusedSetlists = library?.setlists.filter((setlist) => setlist.refused) ?? [];

  return (
    <>
      <SectionTitle>Sync and storage</SectionTitle>
      <Group title="Sync" description="Your songs sync with your account by themselves, a moment after each change.">
        <p role="status">{syncStatusText(sync, lastSynced)}</p>
        {library && library.conflicts > 0 ? (
          <p className="mt-2">
            <Link to="/conflicts" className="font-semibold text-accent hover:underline">
              {library.conflicts === 1 ? '1 song was' : `${library.conflicts} songs were`} changed on two devices: choose which to keep
            </Link>
          </p>
        ) : null}
        <button type="button" disabled={sync === 'syncing'} className={`mt-3 ${SECONDARY}`} onClick={() => void runSync()}>
          Sync now
        </button>
      </Group>

      <Group title="Storage" description={`An account holds up to ${LIMITS.songs} songs and ${LIMITS.setlists} setlists.`}>
        {library ? (
          <div className="flex max-w-md flex-col gap-4">
            <Usage label="Songs" used={library.songs.length - refusedSongs.length} limit={LIMITS.songs} />
            <Usage label="Setlists" used={library.setlists.length - refusedSetlists.length} limit={LIMITS.setlists} />
          </div>
        ) : null}
        {refusedSongs.length + refusedSetlists.length > 0 ? (
          <div className="mt-5">
            <p className="font-semibold">Not in your account</p>
            <p className="text-sm text-muted">These are only on this device. Shorten the long ones, or delete what you don’t need to make room.</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {[...refusedSongs.map((song) => ({ id: song.id, name: song.title || UNTITLED_TITLE, to: `/songs/${song.id}`, why: song.refused! })),
                ...refusedSetlists.map((setlist) => ({ id: setlist.id, name: setlist.name, to: `/setlists/${setlist.id}`, why: setlist.refused! }))].map((row) => (
                <li key={row.id}>
                  <Link to={row.to} className="text-accent hover:underline">
                    {row.name}
                  </Link>{' '}
                  <span className="text-muted">— {row.why.reason === 'size' ? 'too long to sync' : 'the account is full'}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Group>

      <Group
        title="Your library in one file"
        description="Export saves every song as a .txt file, with your notes and setlists, in one zip. Importing that zip brings them back; songs already here aren’t added twice."
      >
        <div className="flex flex-wrap gap-3">
          <ExportLibrary className={SECONDARY} />
          {/* Phones only read songs; they're added on a computer or tablet. */}
          {phone ? null : <ImportSongs className={SECONDARY}>Import…</ImportSongs>}
        </div>
      </Group>
    </>
  );
}

/** "Songs: 37 of 200", with a bar. */
function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const full = used >= limit;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className={full ? 'font-semibold text-chord' : 'text-muted'}>
          {used} of {limit}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${label} in your account`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        className="mt-1 h-2 overflow-hidden rounded bg-chip"
      >
        <div className={`h-full ${full ? 'bg-chord' : 'bg-accent'}`} style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
      </div>
    </div>
  );
}
