-- The value that tells devices the database was restored (migration 20261009120000). Run with `npm run test:db`
-- in web/ (the local Supabase must be running).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is((select count(*)::int from public.server_epoch), 1, 'there is one epoch');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'a@example.com');
select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);

select is((select count(*)::int from public.server_epoch), 1, 'a signed-in account reads it');
select throws_ok($$ update public.server_epoch set value = gen_random_uuid() $$, '42501', null, 'an account cannot change it');
select throws_ok($$ insert into public.server_epoch (singleton) values (false) $$, '42501', null, 'an account cannot add one');
select throws_ok($$ delete from public.server_epoch $$, '42501', null, 'an account cannot delete it');

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok($$ select * from public.server_epoch $$, '42501', null, 'a signed-out visitor cannot read it');

select * from finish();
rollback;
