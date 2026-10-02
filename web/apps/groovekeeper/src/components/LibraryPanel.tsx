import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { listSongs, matchesSearch } from '../library/library';
import { ImportSongs } from './ImportSongs';

interface Props {
  className?: string;
  /** The song that is open, highlighted in the list. */
  activeId?: string;
}

/** The library: every song by title, with a search over title, artist and key. */
export function LibraryPanel({ className = '', activeId }: Props) {
  const songs = useLiveQuery(listSongs, []);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const shown = songs?.filter((song) => matchesSearch(song, search));

  return (
    <nav aria-label="Library" className={`flex min-h-0 flex-col ${className}`}>
      <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">Library</h2>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search title, artist or key"
        aria-label="Search the library"
        className="mt-3 rounded border border-line bg-window px-2 py-1.5 text-sm placeholder:text-hint focus:border-accent focus:outline-none"
      />
      <ul className="mt-3 min-h-0 flex-1 overflow-y-auto">
        {shown?.map((song) => (
          <li key={song.id}>
            <Link
              to={`/songs/${song.id}`}
              aria-current={song.id === activeId ? 'page' : undefined}
              className="block rounded px-2.5 py-2 hover:bg-hover aria-[current=page]:bg-hover"
            >
              <span className="block text-sm font-semibold">{song.title}</span>
              <span className="block text-xs text-muted">{[song.artist, song.key].filter(Boolean).join(' · ')}</span>
            </Link>
          </li>
        ))}
      </ul>
      {songs?.length === 0 && <p className="px-2.5 text-sm text-muted">No songs yet.</p>}
      {songs && songs.length > 0 && shown?.length === 0 && (
        <p className="px-2.5 text-sm text-muted">No song matches “{search.trim()}”.</p>
      )}
      <div className="mt-3">
        <ImportSongs
          className="rounded px-2.5 py-1.5 text-sm hover:bg-hover"
          onImported={(ids) => ids.length === 1 && navigate(`/songs/${ids[0]}`)}
        >
          + Import songs…
        </ImportSongs>
      </div>
    </nav>
  );
}
