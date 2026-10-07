-- Deleting one's own account (migration 20261007120000): everything in it goes, and nobody else's.
-- Run with `npm run test:db` in web/ (the local Supabase must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into public.songs (id, owner_id, title) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Amazing Grace'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'Scarborough Fair');
insert into public.setlists (id, owner_id, name) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Friday gig');

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$ select public.delete_account() $$, '42501', null, 'a signed-out visitor can''t call it');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
select lives_ok($$ select public.delete_account() $$, 'a signed-in user deletes their account');
select lives_ok($$ select public.delete_account() $$, 'calling it again (an answer lost on the way) does nothing');

select set_config('role', 'postgres', true);
select is((select count(*)::integer from auth.users where id = '00000000-0000-0000-0000-00000000000a'), 0, 'the account is gone');
select is((select count(*)::integer from public.songs where owner_id = '00000000-0000-0000-0000-00000000000a')
        + (select count(*)::integer from public.setlists where owner_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'its songs and setlists are gone');
select is((select title from public.songs where id = '10000000-0000-0000-0000-000000000002'), 'Scarborough Fair',
  'another account keeps its songs');

select * from finish();
rollback;
