-- Sprint 6 (#35): members, invitations, roles, ownership transfer, publications.
-- Run with `supabase test db` or scripts/db-test-local.sh. Everything rolls back.
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
create function pg_temp.mail(p_key text) returns text language sql stable as $$
  select 'collab-' || p_key || '-' || pg_temp.id(p_key)::text || '@example.test'
$$;
create function pg_temp.as_user(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', pg_temp.id(p_key)::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.id(p_key), 'role', 'authenticated')::text, true);
end;
$$;

do $$
declare k text;
begin
  foreach k in array array['owner','editor','viewer','outsider','invitee','unverified','wa','ca','ct','e1','e2','e3'] loop
    perform set_config('nexora_test.' || k, gen_random_uuid()::text, true);
  end loop;
end;
$$;
insert into auth.users(id, email, email_confirmed_at)
select pg_temp.id(k), pg_temp.mail(k), now()
from unnest(array['owner','editor','viewer','outsider','invitee','unverified']) k;
update public.profiles set display_name = initcap(id::text), email_verified_at = now()
where id in (select pg_temp.id(k) from unnest(array['owner','editor','viewer','outsider','invitee']) k);
insert into public.workspaces(id, owner_id, name) values (pg_temp.id('wa'), pg_temp.id('owner'), 'Collab workspace');
insert into public.workspace_members(workspace_id, user_id, role) values
  (pg_temp.id('wa'), pg_temp.id('editor'), 'editor'),
  (pg_temp.id('wa'), pg_temp.id('viewer'), 'viewer');
insert into public.canvases(id, workspace_id, name) values
  (pg_temp.id('ca'), pg_temp.id('wa'), 'Published page'),
  (pg_temp.id('ct'), pg_temp.id('wa'), 'Trashed page');
insert into public.elements(id, workspace_id, canvas_id, type, content_json, style_json) values
  (pg_temp.id('e1'), pg_temp.id('wa'), pg_temp.id('ca'), 'text',
    '{"text":"# Hello","documentOrder":1,"secret":"NEVER_EXPOSE"}', '{"fontSize":16,"align":"left","storage":"NEVER_EXPOSE"}'),
  (pg_temp.id('e2'), pg_temp.id('wa'), pg_temp.id('ca'), 'shape', '{"kind":"ellipse","text":"Node","documentOrder":0}', '{"fill":"blue"}'),
  (pg_temp.id('e3'), pg_temp.id('wa'), pg_temp.id('ca'), 'image', '{"path":"NEVER_EXPOSE/private.png","documentOrder":2}', '{}');

set local role authenticated;

-- Members list
do $$
begin
  perform pg_temp.as_user('owner');
  perform pg_temp.record(extensions.is((select count(*) from public.list_workspace_members(pg_temp.id('wa'))), 3::bigint, 'Owner lists all three members'));
  perform pg_temp.record(extensions.is((select role from public.list_workspace_members(pg_temp.id('wa')) limit 1), 'owner', 'Owner is listed first'));
  perform pg_temp.record(extensions.is((select count(*) from public.list_workspace_members(pg_temp.id('wa')) where email is not null), 3::bigint, 'Owner sees member e-mails'));
  perform pg_temp.as_user('viewer');
  perform pg_temp.record(extensions.is((select count(*) from public.list_workspace_members(pg_temp.id('wa')) where email is not null), 1::bigint, 'Viewer sees only its own e-mail'));
  perform pg_temp.as_user('outsider');
  perform pg_temp.record(extensions.throws_ok($q$select * from public.list_workspace_members(pg_temp.id('wa'))$q$, '42501', null, 'Outsider cannot list members'));
end;
$$;

-- Invitations
do $$
begin
  perform pg_temp.as_user('editor');
  perform pg_temp.record(extensions.throws_ok($q$select * from public.create_workspace_invitation(pg_temp.id('wa'), pg_temp.mail('invitee'), 'editor')$q$, '42501', null, 'Editor cannot invite'));
  perform pg_temp.as_user('owner');
  perform pg_temp.record(extensions.throws_ok($q$select * from public.create_workspace_invitation(pg_temp.id('wa'), 'not-an-email', 'editor')$q$, '22023', null, 'Malformed e-mail is rejected'));
  perform pg_temp.record(extensions.throws_ok($q$select * from public.create_workspace_invitation(pg_temp.id('wa'), pg_temp.mail('invitee'), 'owner')$q$, '23514', null, 'Owner role cannot be granted by invitation'));
  perform pg_temp.record(extensions.throws_ok(format('select * from public.create_workspace_invitation(%L, %L, ''viewer'')', pg_temp.id('wa'), upper(pg_temp.mail('editor'))), '23505', 'Пользователь уже является участником', 'Existing member is reported regardless of case'));
  perform set_config('nexora_test.first_token', token, true) from public.create_workspace_invitation(pg_temp.id('wa'), pg_temp.mail('invitee'), 'viewer');
  perform set_config('nexora_test.second_token', token, true) from public.create_workspace_invitation(pg_temp.id('wa'), ' ' || upper(pg_temp.mail('invitee')) || ' ', 'editor');
  perform pg_temp.record(extensions.is((select count(*) from public.workspace_invitations where workspace_id = pg_temp.id('wa') and accepted_at is null and revoked_at is null), 1::bigint, 'Re-inviting replaces the pending invitation'));
  perform set_config('nexora_test.unverified_token', token, true) from public.create_workspace_invitation(pg_temp.id('wa'), pg_temp.mail('unverified'), 'viewer');

  perform pg_temp.as_user('invitee');
  perform pg_temp.record(extensions.throws_ok($q$select public.accept_workspace_invitation(current_setting('nexora_test.first_token'))$q$, '42501', 'invitation_revoked', 'Replaced invitation token is revoked'));
  perform pg_temp.record(extensions.throws_ok($q$select public.accept_workspace_invitation('0000')$q$, '42501', 'invitation_invalid', 'Unknown token is invalid'));
  perform pg_temp.as_user('outsider');
  perform pg_temp.record(extensions.throws_ok($q$select public.accept_workspace_invitation(current_setting('nexora_test.second_token'))$q$, '42501', 'invitation_email_mismatch', 'Another account cannot accept'));
  perform pg_temp.as_user('unverified');
  perform pg_temp.record(extensions.throws_ok($q$select public.accept_workspace_invitation(current_setting('nexora_test.unverified_token'))$q$, '42501', 'invitation_email_unverified', 'Account without proven e-mail cannot accept'));
  perform pg_temp.as_user('invitee');
  perform pg_temp.record(extensions.is(public.accept_workspace_invitation(current_setting('nexora_test.second_token')), pg_temp.id('wa'), 'Invitee accepts the latest invitation'));
  perform pg_temp.record(extensions.is(nexora_private.workspace_role(pg_temp.id('wa')), 'editor', 'Latest invitation role is applied'));
  perform pg_temp.record(extensions.throws_ok($q$select public.accept_workspace_invitation(current_setting('nexora_test.second_token'))$q$, '42501', 'invitation_used', 'Invitation is single use'));
end;
$$;

-- Invitation rate limit (security audit #44)
do $$
declare n int;
begin
  perform pg_temp.as_user('owner');
  select count(*) into n from public.workspace_invitations where workspace_id = pg_temp.id('wa') and created_at > now() - interval '1 hour';
  for i in n + 1 .. 20 loop
    perform public.create_workspace_invitation(pg_temp.id('wa'), 'bulk' || i || '@example.test', 'viewer');
  end loop;
  perform pg_temp.record(extensions.throws_ok($q$select * from public.create_workspace_invitation(pg_temp.id('wa'), 'bulk-over@example.test', 'viewer')$q$, '54000', 'invitation_rate_limit', 'More than 20 invitations per hour are refused'));
end;
$$;

-- Roles and removal
do $$
begin
  perform pg_temp.as_user('editor');
  perform pg_temp.record(extensions.throws_ok($q$select public.set_member_role(pg_temp.id('wa'), pg_temp.id('viewer'), 'editor')$q$, '42501', null, 'Editor cannot change roles'));
  perform pg_temp.record(extensions.throws_ok($q$select public.remove_workspace_member(pg_temp.id('wa'), pg_temp.id('viewer'))$q$, '42501', null, 'Editor cannot remove others'));
  perform pg_temp.as_user('owner');
  perform pg_temp.record(extensions.throws_ok($q$select public.set_member_role(pg_temp.id('wa'), pg_temp.id('editor'), 'owner')$q$, '23514', null, 'Owner role cannot be assigned through role change'));
  perform pg_temp.record(extensions.throws_ok($q$select public.set_member_role(pg_temp.id('wa'), pg_temp.id('owner'), 'viewer')$q$, 'P0002', null, 'Owner cannot demote itself'));
  perform pg_temp.record(extensions.lives_ok($q$select public.set_member_role(pg_temp.id('wa'), pg_temp.id('invitee'), 'viewer')$q$, 'Owner restricts a member to viewer'));
  perform pg_temp.as_user('invitee');
  perform pg_temp.record(extensions.throws_ok($q$insert into public.elements(workspace_id, canvas_id, type, created_by) values (pg_temp.id('wa'), pg_temp.id('ca'), 'text', pg_temp.id('invitee'))$q$, '42501', null, 'Restricted member can no longer edit'));
  perform pg_temp.record(extensions.lives_ok($q$select public.remove_workspace_member(pg_temp.id('wa'), pg_temp.id('invitee'))$q$, 'Member can leave the workspace'));
  perform pg_temp.record(extensions.is((select count(*) from public.workspaces where id = pg_temp.id('wa')), 0::bigint, 'Former member loses access'));
  perform pg_temp.as_user('owner');
  perform pg_temp.record(extensions.throws_ok($q$select public.remove_workspace_member(pg_temp.id('wa'), pg_temp.id('owner'))$q$, 'P0002', null, 'Owner cannot leave without transferring ownership'));
end;
$$;

-- Publications
do $$
declare v_slug text; v_new text; payload jsonb;
begin
  perform pg_temp.as_user('viewer');
  perform pg_temp.record(extensions.throws_ok($q$select * from public.publish_canvas(pg_temp.id('ca'))$q$, '42501', null, 'Viewer cannot publish'));
  perform pg_temp.as_user('outsider');
  perform pg_temp.record(extensions.throws_ok($q$select * from public.publish_canvas(pg_temp.id('ca'))$q$, '42501', null, 'Outsider cannot publish'));
  perform pg_temp.as_user('editor');
  select slug into v_slug from public.publish_canvas(pg_temp.id('ca'));
  perform pg_temp.record(extensions.ok(v_slug ~ '^[0-9a-f]{48}$', 'Editor publishes with a random slug'));
  perform pg_temp.record(extensions.is((select slug from public.publish_canvas(pg_temp.id('ca'))), v_slug, 'Publishing again keeps the active link'));
  payload := public.get_published_canvas(v_slug);
  perform pg_temp.record(extensions.is(jsonb_array_length(payload->'elements'), 2, 'Public projection omits image elements'));
  perform pg_temp.record(extensions.ok(payload::text not like '%NEVER_EXPOSE%', 'Public projection omits private fields and paths'));
  perform pg_temp.record(extensions.is((select e->'content_json'->>'kind' from jsonb_array_elements(payload->'elements') e where e->>'type' = 'shape'), 'ellipse', 'Shape kind is exposed under the key the editor writes'));
  perform pg_temp.record(extensions.is((select (e->'content_json'->>'documentOrder')::int from jsonb_array_elements(payload->'elements') e where e->>'type' = 'text'), 1, 'Document order is exposed'));
  perform pg_temp.record(extensions.is((select (e->'style_json'->>'fontSize')::int from jsonb_array_elements(payload->'elements') e where e->>'type' = 'text'), 16, 'camelCase styles are exposed'));

  perform public.unpublish_canvas(pg_temp.id('ca'));
  perform pg_temp.record(extensions.ok(public.get_published_canvas(v_slug) is null, 'Disabled publication stops serving content'));
  select slug into v_new from public.publish_canvas(pg_temp.id('ca'));
  perform pg_temp.record(extensions.ok(v_new <> v_slug, 'Re-publishing issues a new link'));
  perform pg_temp.record(extensions.ok(public.get_published_canvas(v_slug) is null, 'The old link stays disabled after re-publishing'));

  update public.canvases set deleted_at = now() where id = pg_temp.id('ca');
  perform pg_temp.record(extensions.ok(public.get_published_canvas(v_new) is null, 'A page in the trash is not served publicly'));
  perform pg_temp.record(extensions.throws_ok($q$select * from public.publish_canvas(pg_temp.id('ca'))$q$, '42501', null, 'A page in the trash cannot be published'));
  update public.canvases set deleted_at = null where id = pg_temp.id('ca');
  perform pg_temp.record(extensions.ok(public.get_published_canvas(v_new) is not null, 'Restored page is served again'));
  perform set_config('nexora_test.slug', v_new, true);
end;
$$;

-- Ownership transfer and workspace deletion
do $$
begin
  perform pg_temp.as_user('owner');
  perform pg_temp.record(extensions.lives_ok($q$select public.transfer_workspace_ownership(pg_temp.id('wa'), pg_temp.id('editor'))$q$, 'Owner transfers ownership to a member'));
  perform pg_temp.record(extensions.is(nexora_private.workspace_role(pg_temp.id('wa')), 'editor', 'Former owner becomes editor'));
  perform pg_temp.record(extensions.throws_ok($q$select * from public.create_workspace_invitation(pg_temp.id('wa'), 'new@example.test', 'viewer')$q$, '42501', null, 'Former owner can no longer invite'));
  perform pg_temp.as_user('editor');
  perform pg_temp.record(extensions.is(nexora_private.workspace_role(pg_temp.id('wa')), 'owner', 'New owner has the owner role'));
  perform public.soft_delete_workspace(pg_temp.id('wa'));
end;
$$;
reset role;
set local role anon;
do $$
begin
  perform pg_temp.record(extensions.ok(public.get_published_canvas(current_setting('nexora_test.slug')) is null, 'Deleting the workspace disables public links immediately'));
end;
$$;
reset role;
set local role authenticated;
do $$
begin
  perform pg_temp.as_user('editor');
  perform public.restore_workspace(pg_temp.id('wa'));
end;
$$;
reset role;
set local role anon;
do $$
begin
  perform pg_temp.record(extensions.ok(public.get_published_canvas(current_setting('nexora_test.slug')) is not null, 'Restoring the workspace restores its publications'));
  perform pg_temp.record(extensions.throws_ok($q$select * from public.list_workspace_members(pg_temp.id('wa'))$q$, '42501', null, 'Anonymous visitor cannot list members'));
  perform pg_temp.record(extensions.throws_ok($q$select * from public.publish_canvas(pg_temp.id('ca'))$q$, '42501', null, 'Anonymous visitor cannot publish'));
end;
$$;
reset role;

do $$
declare failures text;
begin
  select string_agg(tap, E'\n') into failures from pg_temp.nexora_tap where tap like 'not ok%';
  if failures is not null then raise exception E'Collaboration test failures:\n%', failures; end if;
end;
$$;
select tap from pg_temp.nexora_tap order by seq;
select * from extensions.finish();
rollback;
