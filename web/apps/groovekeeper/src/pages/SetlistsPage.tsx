import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { createSetlist, listSetlists } from '../library/setlists';
import { useIsPhone } from '../phone';
import { toast } from '../toasts';

/** Every setlist, by name. Setlists are made on a computer or tablet; a phone opens them to play. */
export function SetlistsPage() {
  const setlists = useLiveQuery(listSetlists, []);
  const phone = useIsPhone();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Setlists – Groovekeeper';
  }, []);

  const create = () => {
    createSetlist()
      .then((id) => navigate(`/setlists/${id}`, { state: { isNew: true } }))
      .catch(() => toast('error', "Couldn't make the setlist", 'Reload the page and try again.'));
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Setlists</h1>
          {phone ? null : (
            <button
              type="button"
              className="rounded bg-accent-fill px-4 py-2 font-semibold text-on-accent hover:brightness-125 pointer-coarse:min-h-11"
              onClick={create}
            >
              New setlist
            </button>
          )}
        </div>
        {setlists?.length === 0 ? (
          <p className="mt-6 text-muted">
            {phone
              ? 'No setlists yet. Setlists are made on a computer or tablet.'
              : 'No setlists yet. Make one for your next gig: the songs in playing order.'}
          </p>
        ) : null}
        <ul className="mt-6">
          {setlists?.map((setlist) => (
            <li key={setlist.id}>
              <Link
                to={`/setlists/${setlist.id}`}
                className="flex items-center justify-between gap-4 rounded px-3 py-3 hover:bg-hover"
              >
                <span className="font-semibold">{setlist.name}</span>
                <span className="text-sm text-muted">
                  {setlist.songs.length === 1 ? '1 song' : `${setlist.songs.length} songs`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
