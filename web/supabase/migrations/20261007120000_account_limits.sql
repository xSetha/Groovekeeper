-- What one account may keep, now that anyone can sign up: the free database holds 500 MB for everyone.
-- - Per song: at most 20,000 characters of text, and 50 notes with 5,000 characters of text together.
-- - Per setlist: at most 500 entries.
-- - Per account: 200 songs and 20 setlists. Deleted rows (kept, emptied, so other devices learn about the
--   deletion) count against ten times that; when there are that many, those deleted over 90 days ago go.
-- The size checks are added without checking rows already stored (not valid), so the migration also runs on
-- a database with bigger songs; those can't be changed until they fit.
-- The app keeps to the same numbers (apps/groovekeeper/src/library/limits.ts), so these only catch what
-- gets past it.
-- And a signed-in user can delete their account, with everything in it.

-- ---- Sizes ----

-- The text the user wrote in a song's notes, together (the cap is on that, not on the JSON around it).
create function public.notes_text_length(notes jsonb) returns integer
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(notes) = 'array'
    then (select coalesce(sum(length(note ->> 'text')), 0)::integer from jsonb_array_elements(notes) as note)
    else 0 end
$$;
revoke execute on function public.notes_text_length(jsonb) from public, anon;
grant execute on function public.notes_text_length(jsonb) to authenticated;

alter table public.songs
  drop constraint songs_text_check,
  add constraint songs_text_check check (length(text) <= 20000) not valid,
  drop constraint songs_notes_check,
  -- The JSON's own length bounds what isn't text (ids, positions, and the text's escapes) with room to spare.
  add constraint songs_notes_check check (
    jsonb_typeof(notes) = 'array' and jsonb_array_length(notes) <= 50
    and public.notes_text_length(notes) <= 5000 and length(notes::text) <= 30000) not valid,
  -- A deleted song keeps nothing but its id: deleted rows can't be used to store songs past the limits.
  add constraint songs_deleted_empty check (
    not deleted or (title = '' and artist = '' and key = '' and text = '' and notes = '[]'::jsonb)) not valid;

alter table public.setlists
  drop constraint setlists_songs_check,
  add constraint setlists_songs_check check (
    jsonb_typeof(songs) = 'array' and jsonb_array_length(songs) <= 500 and length(songs::text) <= 50000) not valid,
  add constraint setlists_deleted_empty check (not deleted or (name = '' and songs = '[]'::jsonb)) not valid;

-- ---- How many ----

-- Refuses a row that takes an account past its limit, with the error code GK001 (the app tells it from the
-- size checks above, 23514). Adding a row, or bringing a deleted one back, counts; changing or deleting rows
-- always works. Each account's adds wait for each other (a lock per account), so parallel ones can't go past.
-- The owner is the row's own (an update can't move it: stamp_change keeps it, but it runs after this).
create function public.keep_within_limits() returns trigger
language plpgsql
security definer -- deleting old deleted rows: the account itself may not delete rows
set search_path = ''
as $$
declare
  kept integer := case tg_table_name when 'songs' then 200 else 20 end;
  owner uuid := case tg_op when 'UPDATE' then old.owner_id else new.owner_id end;
  live integer;
  total integer;
begin
  -- Changing a row, or deleting it, takes no room.
  if tg_op = 'UPDATE' and (new.deleted or not old.deleted) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(tg_table_name || owner::text, 0));
  execute format('select count(*) filter (where not deleted), count(*) from public.%I where owner_id = $1', tg_table_name)
    into live, total using owner;
  if not new.deleted and live >= kept then
    raise exception using errcode = 'GK001', message = format('An account holds up to %s %s.', kept, tg_table_name);
  end if;
  if tg_op = 'INSERT' and total >= kept * 10 then
    -- A device away for 90 days that still has one of these songs puts it back when it's changed there.
    execute format('delete from public.%I where owner_id = $1 and deleted and updated_at < now() - interval ''90 days''',
      tg_table_name) using owner;
    execute format('select count(*) from public.%I where owner_id = $1', tg_table_name) into total using owner;
    if total >= kept * 10 then
      raise exception using errcode = 'GK001',
        message = format('This account deleted too many %s lately; try again later.', tg_table_name);
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.keep_within_limits() from public, anon, authenticated;

create trigger songs_limit before insert or update on public.songs
  for each row execute function public.keep_within_limits();
create trigger setlists_limit before insert or update on public.setlists
  for each row execute function public.keep_within_limits();

-- ---- Deleting the account ----

-- Deletes the signed-in user's account; their songs and setlists go with it (on delete cascade). It takes no
-- user: it can only ever delete the caller's own account. Calling it again after it worked does nothing.
create function public.delete_account() returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;
revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
