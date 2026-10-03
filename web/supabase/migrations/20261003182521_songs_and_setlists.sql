-- Songs and setlists of each account, synced with the library the web app keeps in the browser.
--
-- Each row belongs to one account (owner_id) and row-level security lets an account reach only its own rows;
-- there is no sharing yet. Rows are never deleted by the app: deleting sets `deleted`, so other devices
-- learn about it when they sync. `version` and `updated_at` are set here, not by the app:
-- - version counts the changes, so a device can save "if nobody changed it since I read version n" and see
--   when someone else saved first;
-- - updated_at is the server's time, so devices can ask for "everything changed since" without trusting
--   their own clocks.

create table public.songs (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Like the desktop library, the song is stored as its .txt text; title, artist and key are kept beside it.
  title text not null default '' check (length(title) <= 500),
  artist text not null default '' check (length(artist) <= 500),
  key text not null default '' check (length(key) <= 10),
  text text not null default '' check (length(text) <= 200000),
  deleted boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table public.setlists (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '' check (length(name) <= 500),
  -- The songs in playing order, as the app keeps them: [{ "id", "songId", "key" }, ...].
  songs jsonb not null default '[]' check (jsonb_typeof(songs) = 'array' and jsonb_array_length(songs) <= 1000),
  deleted boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Syncing asks for an account's rows changed since a time.
create index songs_owner_updated on public.songs (owner_id, updated_at);
create index setlists_owner_updated on public.setlists (owner_id, updated_at);

-- A new row starts at version 1; every change counts one up. Both take the server's time.
create function public.stamp_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.version := 1;
  else
    new.version := old.version + 1;
    -- A row stays with the account that made it.
    new.owner_id := old.owner_id;
  end if;
  return new;
end;
$$;

create trigger songs_stamp before insert or update on public.songs
  for each row execute function public.stamp_change();
create trigger setlists_stamp before insert or update on public.setlists
  for each row execute function public.stamp_change();

-- Only signed-in accounts, and only their own rows. Nothing is deleted outright, so there's no delete policy.
alter table public.songs enable row level security;
alter table public.setlists enable row level security;

create policy "Read own songs" on public.songs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Add own songs" on public.songs for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Change own songs" on public.songs for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "Read own setlists" on public.setlists for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Add own setlists" on public.setlists for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Change own setlists" on public.setlists for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Signed-out visitors get nothing at all, not even an empty answer from the tables.
revoke all on public.songs, public.setlists from anon;
revoke delete, truncate, references, trigger on public.songs, public.setlists from authenticated;
