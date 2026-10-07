-- What one account may keep (migration 20261007120000): sizes per song and setlist, 200 songs and 20
-- setlists, and deleted rows. Run with `npm run test:db` in web/ (the local Supabase must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

-- Sizes
select throws_ok($$ insert into public.songs (id, text) values (gen_random_uuid(), repeat('x', 20001)) $$,
  '23514', null, 'a song holds up to 20,000 characters');
select lives_ok($$ insert into public.songs (id, text) values ('10000000-0000-0000-0000-000000000001', repeat('x', 20000)) $$,
  'a song of 20,000 characters is kept');
select throws_ok(
  $$ update public.songs set notes = (select jsonb_agg(jsonb_build_object('id', i, 'text', 'n')) from generate_series(1, 51) i)
     where id = '10000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a song has up to 50 notes');
select throws_ok(
  $$ update public.songs set notes = jsonb_build_array(jsonb_build_object('id', 'n1', 'text', repeat('x', 5001)))
     where id = '10000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'notes hold up to 5,000 characters together');
select lives_ok(
  $$ update public.songs set notes = (select jsonb_agg(jsonb_build_object('id', i, 'text', repeat('x', 100), 'column', 4, 'top', 30, 'printRow', 0.5))
     from generate_series(1, 50) i) where id = '10000000-0000-0000-0000-000000000001' $$,
  '50 notes of 100 characters are kept');
select throws_ok(
  $$ insert into public.setlists (id, songs) values (gen_random_uuid(),
     (select jsonb_agg(jsonb_build_object('id', i, 'songId', i)) from generate_series(1, 501) i)) $$,
  '23514', null, 'a setlist has up to 500 entries');

-- How many
insert into public.songs (id) select gen_random_uuid() from generate_series(1, 199);
select is((select count(*)::integer from public.songs), 200, 'an account keeps 200 songs');
select throws_ok($$ insert into public.songs (id) values (gen_random_uuid()) $$,
  'GK001', null, 'the 201st song is refused');
select lives_ok($$ update public.songs set title = 'Amazing Grace' where id = '10000000-0000-0000-0000-000000000001' $$,
  'a song can still be changed at the limit');
select lives_ok($$ update public.songs set deleted = true, title = '', text = '', notes = '[]' where id = '10000000-0000-0000-0000-000000000001' $$,
  'a song can still be deleted at the limit');
select lives_ok($$ insert into public.songs (id) values (gen_random_uuid()) $$,
  'a song can be added again after deleting one');
select throws_ok($$ update public.songs set deleted = false where id = '10000000-0000-0000-0000-000000000001' $$,
  'GK001', null, 'a deleted song can''t come back past the limit');
select throws_ok(
  $$ update public.songs set deleted = false, owner_id = gen_random_uuid() where id = '10000000-0000-0000-0000-000000000001' $$,
  'GK001', null, 'a deleted song can''t come back past the limit by naming another owner');
select throws_ok($$ insert into public.songs (id, deleted, text) values (gen_random_uuid(), true, 'all of a song') $$,
  '23514', null, 'a deleted song keeps nothing: deleted rows can''t store songs past the limit');
select lives_ok($$ insert into public.songs (id, deleted) values (gen_random_uuid(), true) $$,
  'an empty deleted song can be added (it counts toward the total, not the 200)');

insert into public.setlists (id) select gen_random_uuid() from generate_series(1, 20);
select throws_ok($$ insert into public.setlists (id) values (gen_random_uuid()) $$,
  'GK001', null, 'the 21st setlist is refused');

-- Another account has its own limit.
select set_config('role', 'postgres', true);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select lives_ok($$ insert into public.songs (id) values (gen_random_uuid()) $$, 'another account adds its own songs');

-- Deleted rows: at 2,000 rows in all, those deleted over a month ago make room; newer ones don't.
select set_config('role', 'postgres', true);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000c', 'c@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.com');
-- Written straight in, past the triggers that set the time.
set local session_replication_role = replica;
insert into public.songs (id, owner_id, deleted, updated_at)
  select gen_random_uuid(), '00000000-0000-0000-0000-00000000000c', true, now() - interval '100 days' from generate_series(1, 2000);
insert into public.songs (id, owner_id, deleted, updated_at)
  select gen_random_uuid(), '00000000-0000-0000-0000-00000000000d', true, now() - interval '1 day' from generate_series(1, 2000);
set local session_replication_role = origin;

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000000c', 'role', 'authenticated')::text, true);
select lives_ok($$ insert into public.songs (id) values (gen_random_uuid()) $$,
  'at 2,000 rows, a new song makes room by removing songs deleted over 90 days ago');
select is((select count(*)::integer from public.songs where deleted), 0, 'those deleted songs are gone');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000000d', 'role', 'authenticated')::text, true);
select throws_ok($$ insert into public.songs (id) values (gen_random_uuid()) $$,
  'GK001', null, 'with 2,000 songs deleted lately, a new one is refused');
select throws_ok($$ insert into public.songs (id, deleted) values (gen_random_uuid(), true) $$,
  'GK001', null, 'and so is a new deleted one');

select * from finish();
rollback;
