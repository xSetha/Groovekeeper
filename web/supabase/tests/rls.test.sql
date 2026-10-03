-- Row-level security: an account reaches only its own songs and setlists, and signed-out visitors nothing.
-- Run with `npm run test:db` in web/ (the local Supabase must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Two accounts, A and B.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

-- Acting as an account: the role and the user id that auth.uid() reads.
create function pg_temp.act_as(account uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', account, 'role', 'authenticated')::text, true);
$$;

-- ---- Account A writes ----
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');

insert into public.songs (id, title, text) values ('10000000-0000-0000-0000-000000000001', 'Amazing Grace', 'Amazing Grace\n');
insert into public.setlists (id, name, songs) values
  ('20000000-0000-0000-0000-000000000001', 'Friday gig', '[{"id": "e1", "songId": "10000000-0000-0000-0000-000000000001", "key": "A"}]');

select is((select owner_id from public.songs where id = '10000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'a new song belongs to the account that added it');
select is((select version from public.songs where id = '10000000-0000-0000-0000-000000000001'), 1, 'a new song is version 1');

select throws_ok(
  $$ insert into public.songs (id, owner_id, title) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'Planted') $$,
  '42501', null, 'an account cannot add a song for another account');

update public.songs set title = 'Amazing Grace!' where id = '10000000-0000-0000-0000-000000000001';
select is((select version from public.songs where id = '10000000-0000-0000-0000-000000000001'), 2, 'every change counts the version up');

update public.songs set version = 1, title = 'Old copy' where id = '10000000-0000-0000-0000-000000000001' and version = 1;
select is((select title from public.songs where id = '10000000-0000-0000-0000-000000000001'), 'Amazing Grace!',
  'a save based on an old version changes nothing (someone saved first)');

update public.songs set version = 99 where id = '10000000-0000-0000-0000-000000000001';
select is((select version from public.songs where id = '10000000-0000-0000-0000-000000000001'), 3, 'the version cannot be set by the app');

update public.songs set owner_id = '00000000-0000-0000-0000-00000000000b' where id = '10000000-0000-0000-0000-000000000001';
select is((select owner_id from public.songs where id = '10000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000a'::uuid, 'a song cannot be given to another account');

select throws_ok($$ delete from public.songs $$, '42501', null, 'songs are not deleted outright (deleting marks them)');
select throws_ok($$ delete from public.setlists $$, '42501', null, 'setlists are not deleted outright');

select throws_ok(
  $$ insert into public.setlists (id, name, songs) values ('20000000-0000-0000-0000-000000000002', 'Bad', '{"not": "a list"}') $$,
  '23514', null, 'a setlist''s songs must be a list');

-- ---- Account B sees nothing of A's ----
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');

select is((select count(*)::int from public.songs), 0, 'another account sees none of the songs');
select is((select count(*)::int from public.setlists), 0, 'another account sees none of the setlists');

update public.songs set title = 'Hacked' where id = '10000000-0000-0000-0000-000000000001';
update public.setlists set name = 'Hacked' where id = '20000000-0000-0000-0000-000000000001';
select throws_ok(
  $$ insert into public.songs (id, title) values ('10000000-0000-0000-0000-000000000001', 'Same id') $$,
  '23505', null, 'another account cannot take over a song by its id');

insert into public.songs (id, title) values ('10000000-0000-0000-0000-00000000000b', 'B''s own song');
select is((select count(*)::int from public.songs), 1, 'an account sees its own songs');

-- ---- Signed out ----
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$ select * from public.songs $$, '42501', null, 'signed out, songs cannot be read');
select throws_ok($$ select * from public.setlists $$, '42501', null, 'signed out, setlists cannot be read');
select throws_ok(
  $$ insert into public.songs (id, title) values ('10000000-0000-0000-0000-000000000003', 'Anonymous') $$,
  '42501', null, 'signed out, songs cannot be added');

-- ---- Back as the database owner: B's changes didn't reach A's rows ----
reset role;
select is((select title from public.songs where id = '10000000-0000-0000-0000-000000000001'), 'Amazing Grace!',
  'another account cannot change the song');
select is((select name from public.setlists where id = '20000000-0000-0000-0000-000000000001'), 'Friday gig',
  'another account cannot change the setlist');
select is((select owner_id from public.songs where id = '10000000-0000-0000-0000-00000000000b'),
  '00000000-0000-0000-0000-00000000000b'::uuid, 'each account''s songs stay its own');

select * from finish();
rollback;
