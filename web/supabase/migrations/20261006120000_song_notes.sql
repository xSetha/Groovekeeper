-- Notes floating over a song in the editor (see SongNote in apps/groovekeeper/src/library/db.ts): kept beside
-- the song's text, which doesn't have them, as the app keeps them: [{ "id", "text", "column", "top", "printRow" }, ...].
-- Songs added before have none.
alter table public.songs
  add column notes jsonb not null default '[]'
  check (jsonb_typeof(notes) = 'array' and jsonb_array_length(notes) <= 500 and length(notes::text) <= 200000);
