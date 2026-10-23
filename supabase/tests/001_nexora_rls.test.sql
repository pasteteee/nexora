-- Run with `supabase test db`. Every fixture, Auth user and extension added by
-- this test is rolled back. These are real Postgres role/RLS checks, not mocks.
begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();

create temporary table nexora_tap (seq bigint generated always as identity, tap text not null);
grant all on all tables in schema pg_temp to authenticated, anon, service_role;
grant all on all sequences in schema pg_temp to authenticated, anon, service_role;
create function pg_temp.record(p_tap text) returns void language sql as $$
  insert into pg_temp.nexora_tap(tap) values (p_tap)
$$;
create function pg_temp.id(p_key text) returns uuid language sql stable as $$
  select current_setting('nexora_test.' || p_key)::uuid
$$;
create function pg_temp.as_user(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', pg_temp.id(p_key)::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_key), 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.embedding() returns extensions.vector language sql immutable as $$
  select (array[1::real] || array_fill(0::real, array[1535]))::extensions.vector
$$;

do $$
declare k text;
begin
  foreach k in array array['owner','editor','viewer','outsider','invitee','pending','wa','wb','ca','cb','sa','sb','ea','eb','g1','g2','snap_a','snap_b','pub_a','pub_b'] loop
    perform set_config('nexora_test.' || k, gen_random_uuid()::text, true);
  end loop;
end;
$$;
insert into auth.users(id, email, email_confirmed_at)
select pg_temp.id(k), 'nexora-rls-' || pg_temp.id(k)::text || '@example.test', now()
from unnest(array['owner','editor','viewer','outsider','invitee','pending']) k;
insert into public.workspaces(id, owner_id, name) values
  (pg_temp.id('wa'), pg_temp.id('owner'), 'RLS workspace A'),
  (pg_temp.id('wb'), pg_temp.id('outsider'), 'RLS workspace B');
insert into public.workspace_members(workspace_id, user_id, role) values
  (pg_temp.id('wa'), pg_temp.id('editor'), 'editor'),
  (pg_temp.id('wa'), pg_temp.id('viewer'), 'viewer');
insert into public.canvases(id, workspace_id, name) values
  (pg_temp.id('ca'), pg_temp.id('wa'), 'Canvas A'),
  (pg_temp.id('cb'), pg_temp.id('wb'), 'Canvas B');
insert into public.sources(id, workspace_id, file_path, original_name, mime_type, size, status) values
  (pg_temp.id('sa'), pg_temp.id('wa'), pg_temp.id('wa') || '/' || pg_temp.id('sa') || '/private-a.pdf', 'private-a.pdf', 'application/pdf', 256, 'ready'),
  (pg_temp.id('sb'), pg_temp.id('wb'), pg_temp.id('wb') || '/' || pg_temp.id('sb') || '/private-b.pdf', 'private-b.pdf', 'application/pdf', 256, 'ready');
insert into public.elements(id, workspace_id, canvas_id, type, source_id, content_json, style_json) values
  (pg_temp.id('ea'), pg_temp.id('wa'), pg_temp.id('ca'), 'text', pg_temp.id('sa'),
    '{"text":"Published note","file_path":"NEVER_EXPOSE_PRIVATE_PATH","ai_history":"NEVER_EXPOSE_AI_HISTORY"}',
    '{"color":"black","storage_url":"NEVER_EXPOSE_PRIVATE_PATH"}'),
  (pg_temp.id('eb'), pg_temp.id('wb'), pg_temp.id('cb'), 'text', pg_temp.id('sb'), '{"text":"Workspace B secret"}', '{}');
insert into public.source_chunks(workspace_id, source_id, position, content, page_ref, embedding)
select pg_temp.id('wa'), pg_temp.id('sa'), n, 'Workspace A fragment ' || n, 'page 1', pg_temp.embedding()
from generate_series(0,6) n;
insert into public.source_chunks(workspace_id, source_id, position, content, embedding)
values (pg_temp.id('wb'), pg_temp.id('sb'), 0, 'Workspace B secret fragment', pg_temp.embedding());
insert into public.canvas_snapshots(id, workspace_id, canvas_id, data_json) values
  (pg_temp.id('snap_a'), pg_temp.id('wa'), pg_temp.id('ca'), '{"private":"snapshot-a"}'),
  (pg_temp.id('snap_b'), pg_temp.id('wb'), pg_temp.id('cb'), '{"private":"snapshot-b"}');
insert into public.publications(id, workspace_id, canvas_id, slug) values
  (pg_temp.id('pub_a'), pg_temp.id('wa'), pg_temp.id('ca'), replace(pg_temp.id('pub_a')::text, '-', '')),
  (pg_temp.id('pub_b'), pg_temp.id('wb'), pg_temp.id('cb'), replace(pg_temp.id('pub_b')::text, '-', ''));
insert into public.ai_requests(workspace_id, user_id, request_type, status) values
  (pg_temp.id('wa'), pg_temp.id('owner'), 'ask_workspace', 'completed'),
  (pg_temp.id('wb'), pg_temp.id('outsider'), 'ask_workspace', 'completed');

do $$
begin
  perform pg_temp.record(extensions.is((select count(*)::integer from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity), 11, 'RLS enabled on all 11 application tables'));
  perform pg_temp.record(extensions.ok(exists(select 1 from pg_extension where extname = 'vector'), 'pgvector installed'));
  perform pg_temp.record(extensions.ok(exists(select 1 from pg_indexes where indexname = 'source_chunks_embedding_hnsw_idx'
    and indexdef like '%hnsw%' and indexdef like '%vector_cosine_ops%'), 'HNSW cosine index exists'));
  perform pg_temp.record(extensions.ok(not (select public from storage.buckets where id = 'nexora-sources'), 'Original file bucket is private'));
  perform pg_temp.record(extensions.is((select file_size_limit from storage.buckets where id = 'nexora-sources'), 26214400::bigint, 'Storage limit is 25 MiB'));
  perform pg_temp.record(extensions.is((select count(*)::integer from public.profiles where id in (pg_temp.id('owner'),pg_temp.id('editor'))), 2, 'Auth trigger bootstraps profiles'));
  perform pg_temp.record(extensions.is((select role from public.workspace_members where workspace_id = pg_temp.id('wa') and user_id = pg_temp.id('owner')), 'owner', 'Workspace trigger bootstraps owner membership'));
  perform pg_temp.record(extensions.throws_ok(format('insert into public.source_chunks(workspace_id,source_id,position,content) values (%L,%L,100,''cross-tenant'')',pg_temp.id('wa'),pg_temp.id('sb')), '23503', null, 'Chunk foreign key rejects a source from another workspace'));
end;
$$;

set local role authenticated;
do $$
declare role_key text; t text; expected_count bigint; own_workspace uuid;
begin
  foreach role_key in array array['owner','editor','viewer','outsider'] loop
    perform pg_temp.as_user(role_key);
    own_workspace := case when role_key = 'outsider' then pg_temp.id('wb') else pg_temp.id('wa') end;
    perform pg_temp.record(extensions.is((select count(*) from public.workspaces), 1::bigint, role_key || ' sees only its workspace'));
    perform pg_temp.record(extensions.is((select count(*) from public.workspaces where id <> own_workspace), 0::bigint, role_key || ' cannot read a foreign workspace'));
    foreach t in array array['canvases','elements','sources','source_chunks','publications','canvas_snapshots'] loop
      execute format('select count(*) from public.%I where workspace_id <> $1', t) into expected_count using own_workspace;
      perform pg_temp.record(extensions.is(expected_count, 0::bigint, role_key || ' cannot read foreign ' || t));
      execute format('select count(*) from public.%I where workspace_id = $1', t) into expected_count using own_workspace;
      perform pg_temp.record(extensions.ok(expected_count > 0, role_key || ' can read own ' || t));
    end loop;
    perform pg_temp.record(extensions.is((select count(*) from public.workspace_members where workspace_id <> own_workspace), 0::bigint, role_key || ' cannot list foreign members'));
    perform pg_temp.record(extensions.is((select count(*) from public.ai_requests where workspace_id <> own_workspace), 0::bigint, role_key || ' cannot read foreign AI logs'));
  end loop;
end;
$$;

do $$
begin
  perform pg_temp.as_user('owner');
  perform pg_temp.record(extensions.lives_ok($q$insert into public.workspaces(name) values ('Owner-created workspace') returning id$q$, 'Owner can create a workspace with INSERT RETURNING'));
  perform pg_temp.record(extensions.results_eq($q$update public.workspaces set name = 'Renamed' where id = pg_temp.id('wa') returning 1$q$, array[1], 'Owner can rename its workspace'));
  perform pg_temp.record(extensions.throws_ok($q$update public.workspaces set owner_id = pg_temp.id('outsider') where id = pg_temp.id('wa')$q$, '42501', null, 'Direct ownership reassignment denied'));
  perform pg_temp.record(extensions.throws_ok($q$delete from public.workspaces where id = pg_temp.id('wa')$q$, '42501', null, 'Owner cannot bypass soft deletion with DELETE'));
  perform pg_temp.record(extensions.throws_ok($q$update public.workspaces set deleted_at = now() - interval '40 days' where id = pg_temp.id('wa')$q$, '42501', null, 'Owner cannot forge a deletion timestamp'));
  perform pg_temp.record(extensions.results_eq($q$update public.workspace_members set role = 'editor' where workspace_id = pg_temp.id('wa') and user_id = pg_temp.id('viewer') returning 1$q$, array[1], 'Owner can change non-owner roles'));
  update public.workspace_members set role = 'viewer' where workspace_id = pg_temp.id('wa') and user_id = pg_temp.id('viewer');
  perform pg_temp.record(extensions.throws_ok($q$update public.workspace_members set role = 'owner' where workspace_id = pg_temp.id('wa') and user_id = pg_temp.id('viewer')$q$, '42501', null, 'Owner role cannot be minted through membership UPDATE'));
  perform pg_temp.record(extensions.is_empty($q$delete from public.workspace_members where workspace_id = pg_temp.id('wa') and role = 'owner' returning 1$q$, 'Owner membership cannot be deleted directly'));
  perform pg_temp.record(extensions.throws_ok($q$insert into public.workspace_members(workspace_id,user_id,role) values (pg_temp.id('wa'),pg_temp.id('invitee'),'editor')$q$, '42501', null, 'Direct membership INSERT cannot bypass invitations'));
  perform pg_temp.record(extensions.is_empty($q$update public.profiles set display_name = 'forged' where id = pg_temp.id('outsider') returning 1$q$, 'A user cannot edit another profile'));
  perform pg_temp.record(extensions.results_eq($q$update public.profiles set display_name = 'Owner' where id = auth.uid() returning 1$q$, array[1], 'User can update own profile'));
end;
$$;

do $$
begin
  perform pg_temp.as_user('editor');
  perform pg_temp.record(extensions.lives_ok($q$insert into public.canvases(workspace_id,name) values(pg_temp.id('wa'),'Editor canvas')$q$, 'Editor can create canvases'));
  perform pg_temp.record(extensions.results_eq($q$update public.elements set x = 100000, y = -100000 where id = pg_temp.id('ea') returning 1$q$, array[1], 'Editor can save large world coordinates'));
  perform pg_temp.record(extensions.results_eq($q$update public.sources set original_name = 'renamed.pdf' where id = pg_temp.id('sa') returning 1$q$, array[1], 'Editor can rename a source'));
  perform pg_temp.record(extensions.results_eq($q$update public.publications set is_active = false where id = pg_temp.id('pub_a') returning 1$q$, array[1], 'Editor can disable a publication according to appendix 2'));
  update public.publications set is_active = true where id = pg_temp.id('pub_a');
  perform pg_temp.record(extensions.lives_ok($q$insert into public.canvas_snapshots(workspace_id,canvas_id,data_json) values(pg_temp.id('wa'),pg_temp.id('ca'),'{}')$q$, 'Editor can create a snapshot'));
  perform pg_temp.record(extensions.is_empty($q$update public.workspaces set name = 'forged' where id = pg_temp.id('wa') returning 1$q$, 'Editor cannot rename the workspace'));
  perform pg_temp.record(extensions.is_empty($q$update public.workspace_members set role = 'editor' where workspace_id = pg_temp.id('wa') and user_id = pg_temp.id('viewer') returning 1$q$, 'Editor cannot change roles'));
  perform pg_temp.record(extensions.throws_ok($q$select public.soft_delete_workspace(pg_temp.id('wa'))$q$, '42501', null, 'Editor cannot delete workspace'));
  perform pg_temp.record(extensions.throws_ok($q$select public.create_workspace_invitation(pg_temp.id('wa'),'blocked@example.test','editor')$q$, '42501', null, 'Editor cannot invite members'));
  perform pg_temp.record(extensions.throws_ok($q$update public.elements set workspace_id = pg_temp.id('wb') where id = pg_temp.id('ea')$q$, '42501', null, 'Element tenancy is immutable to clients'));
  perform pg_temp.record(extensions.throws_ok($q$update public.sources set status = 'ready' where id = pg_temp.id('sa')$q$, '42501', null, 'Clients cannot forge source processing state'));
  perform pg_temp.record(extensions.throws_ok($q$insert into public.source_chunks(workspace_id,source_id,position,content) values(pg_temp.id('wa'),pg_temp.id('sa'),99,'forged')$q$, '42501', null, 'Only a server worker can write indexed fragments'));
  perform pg_temp.record(extensions.throws_ok($q$insert into public.ai_requests(workspace_id,request_type) values(pg_temp.id('wa'),'ask_workspace')$q$, '42501', null, 'AI diagnostic writes are server-only'));
  perform pg_temp.record(extensions.throws_ok($q$insert into public.elements(workspace_id,canvas_id,type) values(pg_temp.id('wa'),pg_temp.id('cb'),'text')$q$, '23503', null, 'Element cannot link a foreign canvas under an accessible workspace ID'));
  perform pg_temp.record(extensions.throws_ok($q$insert into public.elements(workspace_id,canvas_id,type,source_id) values(pg_temp.id('wa'),pg_temp.id('ca'),'text',pg_temp.id('sb'))$q$, '23503', null, 'Element cannot link a source from another workspace'));
  perform pg_temp.record(extensions.throws_ok($q$insert into public.elements(workspace_id,canvas_id,type,created_by) values(pg_temp.id('wa'),pg_temp.id('ca'),'text',pg_temp.id('owner'))$q$, '42501', null, 'Creator identity cannot be forged'));
  perform pg_temp.record(extensions.throws_ok($q$insert into public.elements(workspace_id,canvas_id,type,x) values(pg_temp.id('wa'),pg_temp.id('ca'),'text','NaN')$q$, '23514', null, 'Non-finite geometry is rejected'));
  perform pg_temp.record(extensions.throws_ok($q$select public.transfer_workspace_ownership(pg_temp.id('wa'),pg_temp.id('editor'))$q$, '42501', null, 'Editor cannot escalate to owner through RPC'));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated','user_metadata',jsonb_build_object('role','owner'))::text,true);
  perform pg_temp.record(extensions.is(nexora_private.workspace_role(pg_temp.id('wa')),'editor','Editable JWT user_metadata cannot grant owner access'));
end;
$$;

do $$
declare k text; cid uuid; sid uuid; eid uuid; snapshot_id uuid; file_path text;
begin
  foreach k in array array['owner','editor'] loop
    perform pg_temp.as_user(k);
    cid := gen_random_uuid(); sid := gen_random_uuid(); eid := gen_random_uuid(); snapshot_id := gen_random_uuid();
    file_path := pg_temp.id('wa') || '/' || sid || '/new.pdf';
    perform pg_temp.record(extensions.lives_ok(format('insert into public.canvases(id,workspace_id,name) values(%L,%L,''CRUD canvas'')',cid,pg_temp.id('wa')),k || ' can INSERT canvas'));
    perform pg_temp.record(extensions.results_eq(format('update public.canvases set name=''updated'' where id=%L returning 1',cid),array[1],k || ' can UPDATE canvas'));
    perform pg_temp.record(extensions.lives_ok(format('insert into public.sources(id,workspace_id,file_path,original_name,mime_type,size) values(%L,%L,%L,''new.pdf'',''application/pdf'',256)',sid,pg_temp.id('wa'),file_path),k || ' can register source'));
    perform pg_temp.record(extensions.lives_ok(format('insert into public.elements(id,workspace_id,canvas_id,type,source_id) values(%L,%L,%L,''text'',%L)',eid,pg_temp.id('wa'),cid,sid),k || ' can INSERT element'));
    perform pg_temp.record(extensions.results_eq(format('update public.elements set x=123 where id=%L returning 1',eid),array[1],k || ' can UPDATE element'));
    perform pg_temp.record(extensions.lives_ok(format('insert into public.publications(workspace_id,canvas_id) values(%L,%L)',pg_temp.id('wa'),cid),k || ' can INSERT publication'));
    perform pg_temp.record(extensions.lives_ok(format('insert into public.canvas_snapshots(id,workspace_id,canvas_id,data_json) values(%L,%L,%L,''{}'')',snapshot_id,pg_temp.id('wa'),cid),k || ' can INSERT snapshot'));
    perform pg_temp.record(extensions.results_eq(format('delete from public.canvas_snapshots where id=%L returning 1',snapshot_id),array[1],k || ' can DELETE snapshot'));
    perform pg_temp.record(extensions.results_eq(format('delete from public.publications where canvas_id=%L returning 1',cid),array[1],k || ' can DELETE publication'));
    perform pg_temp.record(extensions.results_eq(format('delete from public.elements where id=%L returning 1',eid),array[1],k || ' can DELETE element'));
    perform pg_temp.record(extensions.results_eq(format('delete from public.sources where id=%L returning 1',sid),array[1],k || ' can DELETE source'));
    perform pg_temp.record(extensions.results_eq(format('delete from public.canvases where id=%L returning 1',cid),array[1],k || ' can DELETE canvas'));
  end loop;
end;
$$;

do $$
declare k text; t text;
begin
  foreach k in array array['viewer','outsider'] loop
    perform pg_temp.as_user(k);
    foreach t in array array['canvases','elements','sources','publications','canvas_snapshots'] loop
      perform pg_temp.record(extensions.is_empty(format('delete from public.%I where workspace_id = %L returning 1',t,pg_temp.id('wa')), k || ' cannot delete ' || t));
    end loop;
    perform pg_temp.record(extensions.is_empty($q$update public.canvases set name = 'forged' where id = pg_temp.id('ca') returning 1$q$, k || ' cannot update canvases'));
    perform pg_temp.record(extensions.is_empty($q$update public.elements set x = 99 where id = pg_temp.id('ea') returning 1$q$, k || ' cannot update elements'));
    perform pg_temp.record(extensions.is_empty($q$update public.sources set original_name = 'forged' where id = pg_temp.id('sa') returning 1$q$, k || ' cannot update sources'));
    perform pg_temp.record(extensions.is_empty($q$update public.publications set is_active = false where id = pg_temp.id('pub_a') returning 1$q$, k || ' cannot update publications'));
    perform pg_temp.record(extensions.throws_ok($q$insert into public.canvases(workspace_id,name) values(pg_temp.id('wa'),'forged')$q$, '42501', null, k || ' cannot create canvases'));
    perform pg_temp.record(extensions.throws_ok($q$insert into public.elements(workspace_id,canvas_id,type) values(pg_temp.id('wa'),pg_temp.id('ca'),'text')$q$, '42501', null, k || ' cannot create elements'));
    perform pg_temp.record(extensions.throws_ok(format('insert into public.sources(id,workspace_id,file_path,original_name,mime_type,size) values(%L,%L,%L,''forged.pdf'',''application/pdf'',256)',pg_temp.id('g1'),pg_temp.id('wa'),pg_temp.id('wa') || '/' || pg_temp.id('g1') || '/forged.pdf'),'42501',null,k || ' cannot register sources'));
    perform pg_temp.record(extensions.throws_ok($q$insert into public.publications(workspace_id,canvas_id) values(pg_temp.id('wa'),pg_temp.id('ca'))$q$, '42501', null, k || ' cannot create publications'));
    perform pg_temp.record(extensions.throws_ok($q$insert into public.canvas_snapshots(workspace_id,canvas_id,data_json) values(pg_temp.id('wa'),pg_temp.id('ca'),'{}')$q$, '42501', null, k || ' cannot create snapshots'));
    perform pg_temp.record(extensions.throws_ok($q$select public.soft_delete_workspace(pg_temp.id('wa'))$q$, '42501', null, k || ' cannot delete workspace through RPC'));
    perform pg_temp.record(extensions.throws_ok($q$select public.create_workspace_invitation(pg_temp.id('wa'),'blocked@example.test','viewer')$q$, '42501', null, k || ' cannot invite members'));
  end loop;
  perform pg_temp.as_user('viewer');
  perform pg_temp.record(extensions.is((select count(*) from public.ai_requests), 0::bigint, 'Viewer cannot read AI diagnostic history'));
  perform pg_temp.record(extensions.is((select count(*) from public.workspace_invitations), 0::bigint, 'Viewer cannot read invitations'));
end;
$$;

do $$
begin
  perform pg_temp.as_user('editor');
  insert into public.elements(id,workspace_id,canvas_id,type) values (pg_temp.id('g1'),pg_temp.id('wa'),pg_temp.id('ca'),'group');
  insert into public.elements(id,workspace_id,canvas_id,type,group_id) values (pg_temp.id('g2'),pg_temp.id('wa'),pg_temp.id('ca'),'group',pg_temp.id('g1'));
  perform pg_temp.record(extensions.lives_ok($q$update public.elements set group_id = pg_temp.id('g2') where id = pg_temp.id('ea')$q$, 'Editor can group elements'));
  perform pg_temp.record(extensions.throws_ok($q$update public.elements set group_id = pg_temp.id('g2') where id = pg_temp.id('g1')$q$, '23514', null, 'Group ancestry cannot contain cycles'));
  perform pg_temp.record(extensions.throws_ok($q$update public.elements set type = 'text' where id = pg_temp.id('g1')$q$, '23514', null, 'A parent group cannot change type while it has children'));
  perform pg_temp.record(extensions.throws_ok($q$insert into public.elements(workspace_id,canvas_id,type,group_id) values(pg_temp.id('wa'),pg_temp.id('ca'),'text',pg_temp.id('eb'))$q$, '23514', null, 'Group must exist on the same canvas'));
  delete from public.elements where id = pg_temp.id('g2');
  perform pg_temp.record(extensions.ok((select group_id is null from public.elements where id = pg_temp.id('ea')), 'Deleting a group ungroups its children'));
  delete from public.elements where id = pg_temp.id('g1');
  perform pg_temp.record(extensions.is((select count(*) from public.match_source_chunks(pg_temp.id('wa'),pg_temp.embedding(),100)), 5::bigint, 'Semantic search clamps result count to five'));
  perform pg_temp.record(extensions.ok(not exists(select 1 from public.match_source_chunks(pg_temp.id('wa'),pg_temp.embedding(),5) where content like '%Workspace B%'), 'Search never returns another workspace fragment (criterion 24)'));
  perform pg_temp.record(extensions.throws_ok($q$select * from public.match_source_chunks(pg_temp.id('wb'),pg_temp.embedding(),5)$q$, '42501', null, 'Search RPC rejects an inaccessible workspace'));
  perform pg_temp.record(extensions.results_eq(
    $q$select id from public.match_source_chunks(pg_temp.id('wa'),pg_temp.embedding(),5)$q$,
    $q$select id from public.source_chunks where workspace_id = pg_temp.id('wa') order by id limit 5$q$,
    'Equal similarity scores have a deterministic UUID tie break'));
  perform pg_temp.record(extensions.throws_ok($q$select * from public.match_source_chunks(pg_temp.id('wa'),array_fill(0::real,array[1536])::extensions.vector,5)$q$, '22023', null, 'Zero vectors are rejected'));
end;
$$;

reset role;
-- Only transient object metadata is used to test Storage RLS; no file payload
-- is uploaded. It is rolled back along with every other fixture.
insert into storage.objects(bucket_id,name,owner_id)
select 'nexora-sources', file_path, pg_temp.id('owner')::text from public.sources where id=pg_temp.id('sa');
set local role authenticated;
do $$
declare k text; expected bigint;
begin
  foreach k in array array['owner','editor','viewer','outsider'] loop
    perform pg_temp.as_user(k);
    expected := case when k='outsider' then 0 else 1 end;
    perform pg_temp.record(extensions.is((select count(*) from storage.objects where bucket_id='nexora-sources'),expected,k || ' has correct private Storage visibility'));
  end loop;
end;
$$;
reset role;
set local role anon;
do $$
declare t text; payload jsonb;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  foreach t in array array['profiles','workspaces','workspace_members','canvases','elements','sources','source_chunks','publications','canvas_snapshots','ai_requests','workspace_invitations'] loop
    perform pg_temp.record(extensions.throws_ok(format('select * from public.%I',t), '42501', null, 'Anon cannot SELECT raw ' || t));
  end loop;
  payload := public.get_published_canvas(replace(pg_temp.id('pub_a')::text,'-',''));
  perform pg_temp.record(extensions.ok(payload is not null, 'Anonymous visitor can read an active publication by slug'));
  perform pg_temp.record(extensions.ok(payload::text not like '%NEVER_EXPOSE_%', 'Public projection excludes private paths, source metadata and AI history'));
  perform pg_temp.record(extensions.ok(not (payload ? 'workspace_id') and not (payload ? 'sources'), 'Public projection omits workspace internals'));
  perform pg_temp.record(extensions.ok(public.get_published_canvas('missing-slug') is null, 'Unknown public slug returns no data'));
  perform pg_temp.record(extensions.throws_ok($q$insert into public.elements(workspace_id,canvas_id,type) values(pg_temp.id('wa'),pg_temp.id('ca'),'text')$q$, '42501', null, 'Anonymous visitor cannot create elements'));
  perform pg_temp.record(extensions.throws_ok($q$select public.soft_delete_workspace(pg_temp.id('wa'))$q$, '42501', null, 'Anonymous visitor cannot call management RPC'));
  perform pg_temp.record(extensions.is((select count(*) from storage.objects where bucket_id='nexora-sources'),0::bigint,'Anonymous visitor cannot read private Storage objects'));
end;
$$;
reset role;
set local role authenticated;
do $$
begin
  perform pg_temp.as_user('owner');
  perform pg_temp.record(extensions.throws_ok($q$select token_hash from public.workspace_invitations$q$, '42501', null, 'Even owners cannot read invitation token hashes through the API'));
  perform set_config('nexora_test.invite_token', token, true) from public.create_workspace_invitation(
    pg_temp.id('wa'),'nexora-rls-' || pg_temp.id('invitee') || '@example.test','editor');
  perform pg_temp.record(extensions.is((select count(*) from public.workspace_invitations where workspace_id = pg_temp.id('wa') and expires_at = created_at + interval '72 hours'),1::bigint,'Invitation lifetime is exactly 72 hours'));
  perform pg_temp.as_user('editor');
  perform pg_temp.record(extensions.throws_ok($q$select public.accept_workspace_invitation(current_setting('nexora_test.invite_token'))$q$, '42501', null, 'Invitation cannot be accepted by a different email'));
  perform pg_temp.as_user('invitee');
  perform pg_temp.record(extensions.lives_ok($q$select public.accept_workspace_invitation(current_setting('nexora_test.invite_token'))$q$, 'Matching confirmed account can accept invitation'));
  perform pg_temp.record(extensions.is(nexora_private.workspace_role(pg_temp.id('wa')),'editor','Accepted invitation assigns its stored role'));
  perform pg_temp.record(extensions.throws_ok($q$select public.accept_workspace_invitation(current_setting('nexora_test.invite_token'))$q$, '42501', null, 'Invitation token is single use'));
  perform pg_temp.as_user('owner');
  perform pg_temp.record(extensions.throws_ok(format('select * from public.create_workspace_invitation(%L,%L,''viewer'')', pg_temp.id('wa'),'nexora-rls-' || pg_temp.id('invitee') || '@example.test'),'23505',null,'Existing member cannot be invited again'));
  perform set_config('nexora_test.revoked_token', token, true), set_config('nexora_test.revoked_id', invitation_id::text, true)
    from public.create_workspace_invitation(pg_temp.id('wa'),'nexora-rls-' || pg_temp.id('pending') || '@example.test','viewer');
  perform public.revoke_workspace_invitation(current_setting('nexora_test.revoked_id')::uuid);
  perform pg_temp.as_user('pending');
  perform pg_temp.record(extensions.throws_ok($q$select public.accept_workspace_invitation(current_setting('nexora_test.revoked_token'))$q$, '42501', null, 'Revoked invitation cannot be accepted'));
  perform pg_temp.as_user('owner');
  perform set_config('nexora_test.expired_token', token, true), set_config('nexora_test.expired_id', invitation_id::text, true)
    from public.create_workspace_invitation(pg_temp.id('wa'),'nexora-rls-' || pg_temp.id('pending') || '@example.test','viewer');
end;
$$;
reset role;
update public.workspace_invitations set created_at = now() - interval '73 hours', expires_at = now() - interval '1 hour'
where id = current_setting('nexora_test.expired_id')::uuid;
set local role authenticated;
do $$
begin
  perform pg_temp.as_user('pending');
  perform pg_temp.record(extensions.throws_ok($q$select public.accept_workspace_invitation(current_setting('nexora_test.expired_token'))$q$, '42501', null, 'Expired invitation cannot be accepted'));
  perform pg_temp.as_user('owner');
  update public.publications set is_active = false where id = pg_temp.id('pub_a');
  perform pg_temp.record(extensions.ok(public.get_published_canvas(replace(pg_temp.id('pub_a')::text,'-','')) is null,'Revoked publication immediately returns no data'));
  update public.publications set is_active = true where id = pg_temp.id('pub_a');
  perform public.soft_delete_workspace(pg_temp.id('wa'));
  perform pg_temp.record(extensions.ok(public.get_published_canvas(replace(pg_temp.id('pub_a')::text,'-','')) is null,'Soft deletion immediately disables public access'));
  perform pg_temp.record(extensions.is((select count(*) from public.elements where workspace_id = pg_temp.id('wa')),0::bigint,'Deleted workspace elements are hidden even from owner'));
  perform pg_temp.as_user('viewer');
  perform pg_temp.record(extensions.is((select count(*) from public.workspaces where id = pg_temp.id('wa')),0::bigint,'Deleted workspace is hidden from ordinary members'));
  perform pg_temp.record(extensions.is((select count(*) from public.source_chunks where workspace_id = pg_temp.id('wa')),0::bigint,'Deleted workspace search fragments are hidden'));
  perform pg_temp.record(extensions.throws_ok($q$select public.restore_workspace(pg_temp.id('wa'))$q$,'42501',null,'Non-owner cannot restore workspace'));
  perform pg_temp.as_user('owner');
  perform pg_temp.record(extensions.lives_ok($q$select public.restore_workspace(pg_temp.id('wa'))$q$,'Owner can restore workspace inside 30 days'));
  perform pg_temp.record(extensions.ok(public.get_published_canvas(replace(pg_temp.id('pub_a')::text,'-','')) is not null,'Restoration restores previously active publications'));
  perform public.soft_delete_workspace(pg_temp.id('wa'));
end;
$$;
reset role;
update public.workspaces set deleted_at = now() - interval '31 days' where id = pg_temp.id('wa');
set local role authenticated;
do $$
begin
  perform pg_temp.as_user('owner');
  perform pg_temp.record(extensions.throws_ok($q$select public.restore_workspace(pg_temp.id('wa'))$q$,'42501',null,'Workspace cannot be restored after 30 days'));
  perform pg_temp.record(extensions.is((select count(*) from public.workspaces where id = pg_temp.id('wa')),0::bigint,'Expired deleted workspace is hidden even from owner'));
end;
$$;
reset role;
update public.workspaces set deleted_at = null where id = pg_temp.id('wa');
set local role service_role;
do $$
begin
  perform pg_temp.record(extensions.lives_ok($q$insert into public.source_chunks(workspace_id,source_id,position,content) values(pg_temp.id('wa'),pg_temp.id('sa'),100,'Worker-created fragment')$q$,'Server worker can insert indexed fragments'));
  perform pg_temp.record(extensions.lives_ok($q$insert into public.ai_requests(workspace_id,user_id,request_type,status) values(pg_temp.id('wa'),pg_temp.id('owner'),'embedding','completed')$q$,'Server worker can write processing diagnostics'));
end;
$$;
reset role;
set local role authenticated;
do $$
begin
  perform pg_temp.as_user('owner');
  perform pg_temp.record(extensions.lives_ok($q$select public.transfer_workspace_ownership(pg_temp.id('wa'),pg_temp.id('editor'))$q$,'Owner can transfer ownership to an existing member'));
  perform pg_temp.record(extensions.is(nexora_private.workspace_role(pg_temp.id('wa')),'editor','Former owner becomes an editor'));
  perform pg_temp.record(extensions.throws_ok($q$select public.soft_delete_workspace(pg_temp.id('wa'))$q$,'42501',null,'Former owner immediately loses owner privileges'));
  perform pg_temp.as_user('editor');
  perform pg_temp.record(extensions.is(nexora_private.workspace_role(pg_temp.id('wa')),'owner','New owner receives owner privileges'));
end;
$$;
reset role;

-- Turn any failed pgTAP assertion into a SQL error for MCP/CI runners as well.
do $$
declare failures text;
begin
  select string_agg(tap,E'\n') into failures from pg_temp.nexora_tap where tap like 'not ok%';
  if failures is not null then raise exception E'RLS test failures:\n%', failures; end if;
end;
$$;
select tap from pg_temp.nexora_tap order by seq;
select * from extensions.finish();
rollback;
