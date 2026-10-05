import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useParams } from 'react-router';
import { db } from '../library/db';
import { setlistSongs } from '../library/setlists';
import { SongReader } from './SongReader';

/** On a phone: a song of a setlist, with the previous and next song at hand. */
export function SetlistSongPage() {
  const { id = '', position = '' } = useParams();
  const place = Number(position);
  // null while loading, undefined when the setlist is gone
  const songs = useLiveQuery(
    async () => {
      const setlist = await db.setlists.get(id);
      return setlist ? { name: setlist.name, songs: await setlistSongs(setlist) } : undefined;
    },
    [id],
    null,
  );

  if (songs === null) return null;
  const song = songs?.songs[place - 1];
  if (!songs || !song) {
    return (
      <main className="p-6">
        <p>This song isn't in the setlist any more.</p>
        <Link to={songs ? `/setlists/${id}` : '/setlists'} className="mt-2 inline-block text-accent hover:underline">
          Back to the setlist
        </Link>
      </main>
    );
  }

  const at = (n: number) => (n >= 1 && n <= songs.songs.length ? `/setlists/${id}/${n}` : null);
  return (
    <SongReader
      // A new song starts as it's written, not with the transposing done on the one before.
      key={place}
      song={song.song}
      back={{ to: `/setlists/${id}`, label: songs.name }}
      steps={{ previous: at(place - 1), next: at(place + 1), position: `${place} of ${songs.songs.length}` }}
    />
  );
}
