-- A song's notes: kept with the song, a list, and not without limit.
-- Run with `npm run test:db` in web/ (the local Supabase must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

insert into public.songs (id, title) values ('10000000-0000-0000-0000-000000000001', 'Amazing Grace');
select is((select notes from public.songs where id = '10000000-0000-0000-0000-000000000001'), '[]'::jsonb,
  'a song added without notes has none');

update public.songs set notes = '[{"id": "n1", "text": "Capo 2", "column": 4, "top": 30, "printRow": 0.5}]'
  where id = '10000000-0000-0000-0000-000000000001';
select is((select notes -> 0 ->> 'text' from public.songs where id = '10000000-0000-0000-0000-000000000001'), 'Capo 2',
  'a song keeps its notes');
select is((select version from public.songs where id = '10000000-0000-0000-0000-000000000001'), 2,
  'a change to the notes counts the version up');

select throws_ok(
  $$ update public.songs set notes = '{"text": "not a list"}' where id = '10000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'notes are a list');
select throws_ok(
  $$ update public.songs set notes = jsonb_build_array(repeat('x', 200001)) where id = '10000000-0000-0000-0000-000000000001' $$,
  '23514', null, 'notes have a size limit');

select * from finish();
rollback;
