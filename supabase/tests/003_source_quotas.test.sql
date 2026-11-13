begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(4);
create temporary table nexora_tap(seq integer generated always as identity, tap text);

insert into auth.users(id,email,email_confirmed_at)
values ('30000000-0000-0000-0000-000000000001','source-quota@example.test',now());
insert into public.workspaces(id,owner_id,name)
values ('30000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','Quota test');

create function pg_temp.add_source(p_size bigint) returns void language plpgsql as $$
declare source_id uuid := gen_random_uuid();
begin
  insert into public.sources(id,workspace_id,file_path,original_name,mime_type,size)
  values (source_id,'30000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002/' || source_id || '/test.txt',
    'test.txt','text/plain',p_size);
end;
$$;

insert into pg_temp.nexora_tap(tap) select extensions.throws_ok('select pg_temp.add_source(26214401)', '23514',
  'Файл должен быть непустым и не больше 25 МиБ','Reject oversized reservation');
insert into pg_temp.nexora_tap(tap) select extensions.lives_ok('select pg_temp.add_source(26214400)','Accept exact 25 MiB boundary');
do $$ begin for i in 1..19 loop perform pg_temp.add_source(26214400); end loop; end $$;
insert into pg_temp.nexora_tap(tap) select extensions.throws_ok('select pg_temp.add_source(1)','23514',
  'Превышен объём тетради 500 МиБ','Reject total above 500 MiB');
delete from public.sources where workspace_id='30000000-0000-0000-0000-000000000002';
do $$ begin for i in 1..100 loop perform pg_temp.add_source(1); end loop; end $$;
insert into pg_temp.nexora_tap(tap) select extensions.throws_ok('select pg_temp.add_source(1)','23514',
  'В тетради уже 100 материалов','Reject 101st source');
do $$ begin
  if exists(select 1 from pg_temp.nexora_tap where tap like 'not ok%') then
    raise exception 'Source quota test failed';
  end if;
end $$;
select tap from pg_temp.nexora_tap order by seq;
select * from extensions.finish();
rollback;
