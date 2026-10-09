import { UNTITLED_TITLE } from '@groovekeeper/core';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { listSongs, matchesSearch } from '../library/library';
import { useNewSong } from '../navigation';
import { useAccount } from '../sync/account';
import { ExportLibrary } from './ExportLibrary';
import { ImportSongs } from './ImportSongs';

interface Props {
  className?: string;
  /** The song that is open, highlighted in the list. */
  activeId?: string;
  /** False on a phone, where the library is read only: no importing, and no exporting PDFs. */
  canImport?: boolean;
}

/** The library: every song by title, with a search over title, artist and key. */
export function LibraryPanel({ className = '', activeId, canImport = true }: Props) {
  const songs = useLiveQuery(listSongs, []);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const newSong = useNewSong();
  const signedIn = useAccount((s) => s.status === 'signedIn');
  const shown = songs?.filter((song) => matchesSearch(song, search));

  return (
    <nav aria-label="Library" className={`flex min-h-0 flex-col ${className}`}>
      <h2 className="font-semibold">Library</h2>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search title, artist or key"
        aria-label="Search the library"
        // Phones zoom into text fields with text under 16px, so the search is smaller only with a mouse.
        className="mt-3 rounded border border-line bg-window px-2 py-1.5 text-base placeholder:text-hint focus:border-accent focus:outline-none pointer-fine:text-sm pointer-coarse:min-h-11"
      />
      {canImport ? (
        <button type="button" className="mt-2 self-start rounded px-2.5 py-1.5 text-sm hover:bg-hover pointer-coarse:min-h-11" onClick={newSong}>
          + New song
        </button>
      ) : null}
      <ul className={`${canImport ? 'mt-1' : 'mt-3'} min-h-0 flex-1 overflow-y-auto`}>
        {shown?.map((song) => (
          <li key={song.id}>
            <Link
              to={`/songs/${song.id}`}
              aria-current={song.id === activeId ? 'page' : undefined}
              className="flex items-center gap-3 rounded px-2.5 py-2 hover:bg-hover aria-[current=page]:bg-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{song.title || UNTITLED_TITLE}</span>
                {song.artist ? <span className="block truncate text-xs text-muted">{song.artist}</span> : null}
                {song.refused ? (
                  <span className="block text-xs text-chord" title="It's on this device only; Settings → Sync and storage says why.">
                    {song.refused.reason === 'size' ? 'Too long to sync' : 'Not in your account'}
                  </span>
                ) : null}
              </span>
              {song.key ? (
                <span className="shrink-0 rounded bg-chip px-1.5 py-0.5 font-mono text-xs text-muted" title={`Key of ${song.key}`}>
                  {song.key}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {songs?.length === 0 ? (
        <p className="px-2.5 text-sm text-muted">
          {canImport ? (
            'No songs yet. Import a song to start.'
          ) : signedIn ? (
            'No songs yet. Songs are written on a computer or tablet.'
          ) : (
            <>
              No songs yet.{' '}
              <Link to="/signin" className="text-accent hover:underline">
                Sign in
              </Link>{' '}
              to get the songs from your account; songs are written on a computer or tablet.
            </>
          )}
        </p>
      ) : null}
      {songs && songs.length > 0 && shown?.length === 0 ? (
        <p className="px-2.5 text-sm text-muted">No song matches “{search.trim()}”.</p>
      ) : null}
      {canImport ? (
        <div className="mt-3 flex flex-wrap gap-1">
          <ImportSongs
            className="rounded px-2.5 py-1.5 text-sm hover:bg-hover pointer-coarse:min-h-11"
            onImported={(ids) => ids.length === 1 && navigate(`/songs/${ids[0]}`)}
          >
            + Import songs…
          </ImportSongs>
          {songs && songs.length > 0 ? (
            <>
              <Link to="/pdf" className="rounded px-2.5 py-1.5 text-sm hover:bg-hover pointer-coarse:min-h-11">
                Export PDF…
              </Link>
              <ExportLibrary className="rounded px-2.5 py-1.5 text-sm hover:bg-hover pointer-coarse:min-h-11" />
            </>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
