-- Tells devices that the database was restored from a backup. Each device keeps the value it last saw; when it
-- differs, the database may have gone back in time, so the device sends its songs and setlists again and
-- repeats the deletions it made lately (apps/groovekeeper/src/sync/sync.ts).
-- A restore into another project gets that project's own value (the backup doesn't carry this table); a restore
-- into this one sets a new value by hand (web/README.md: Restoring a backup).

create table public.server_epoch (
  -- One row only.
  singleton boolean primary key default true check (singleton),
  value uuid not null default gen_random_uuid()
);
insert into public.server_epoch default values;

-- Signed-in accounts read it; nothing changes it but the database's owner.
alter table public.server_epoch enable row level security;
create policy "Read the epoch" on public.server_epoch for select to authenticated using (true);
revoke all on public.server_epoch from anon;
revoke insert, update, delete, truncate, references, trigger on public.server_epoch from authenticated;
