-- Nexora: technical specification sections 4.1.4, 4.3.1 and appendices 1-2.
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists nexora_private;
revoke all on schema nexora_private from public;
grant usage on schema nexora_private to authenticated, anon, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  avatar_url text,
  preferences_json jsonb not null default '{}' check (jsonb_typeof(preferences_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_owner_id_idx on public.workspaces(owner_id);
create index workspaces_deleted_at_idx on public.workspaces(deleted_at) where deleted_at is not null;

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_id_idx on public.workspace_members(user_id, workspace_id);
create unique index workspace_members_one_owner_idx on public.workspace_members(workspace_id) where role = 'owner';

create table public.canvases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  position integer not null default 0 check (position >= 0),
  background_type text not null default 'grid' check (background_type in ('plain', 'grid', 'dots', 'ruled')),
  background_spacing double precision not null default 24 check (background_spacing > 0 and background_spacing < 'Infinity'::float8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index canvases_workspace_position_idx on public.canvases(workspace_id, position, id);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 512),
  mime_type text not null check (mime_type in (
    'application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/markdown', 'image/png', 'image/jpeg'
  )),
  size bigint not null check (size > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'error', 'requires_ocr')),
  metadata_json jsonb not null default '{}' check (jsonb_typeof(metadata_json) = 'object'),
  error_message text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  constraint sources_workspace_path check (file_path like workspace_id::text || '/' || id::text || '/%')
);
create index sources_workspace_id_idx on public.sources(workspace_id);
create index sources_created_by_idx on public.sources(created_by);
create index sources_processing_idx on public.sources(status, created_at) where status in ('pending', 'processing', 'error');

create table public.elements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  canvas_id uuid not null,
  type text not null check (type in ('text', 'note', 'image', 'formula', 'shape', 'connector', 'diagram_node', 'source', 'source_fragment', 'group')),
  x double precision not null default 0 check (x > '-Infinity'::float8 and x < 'Infinity'::float8),
  y double precision not null default 0 check (y > '-Infinity'::float8 and y < 'Infinity'::float8),
  width double precision not null default 200 check (width > 0 and width < 'Infinity'::float8),
  height double precision not null default 100 check (height > 0 and height < 'Infinity'::float8),
  rotation double precision not null default 0 check (rotation > '-Infinity'::float8 and rotation < 'Infinity'::float8),
  z_index integer not null default 0,
  content_json jsonb not null default '{}' check (jsonb_typeof(content_json) = 'object'),
  style_json jsonb not null default '{}' check (jsonb_typeof(style_json) = 'object'),
  source_id uuid,
  group_id uuid,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, canvas_id),
  foreign key (canvas_id, workspace_id) references public.canvases(id, workspace_id) on delete cascade,
  foreign key (source_id, workspace_id) references public.sources(id, workspace_id) on delete set null (source_id),
  foreign key (group_id, canvas_id) references public.elements(id, canvas_id) on delete set null (group_id),
  check (group_id is null or group_id <> id)
);
create index elements_canvas_id_idx on public.elements(canvas_id, z_index, id);
create index elements_workspace_id_idx on public.elements(workspace_id);
create index elements_source_id_idx on public.elements(source_id, workspace_id) where source_id is not null;
create index elements_group_id_idx on public.elements(group_id, canvas_id) where group_id is not null;
create index elements_created_by_idx on public.elements(created_by);

create table public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  source_id uuid not null,
  position integer not null check (position >= 0),
  content text not null check (char_length(btrim(content)) > 0),
  page_ref text,
  embedding extensions.vector(1536),
  metadata_json jsonb not null default '{}' check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (source_id, workspace_id) references public.sources(id, workspace_id) on delete cascade,
  unique (source_id, position),
  check (embedding is null or extensions.vector_norm(embedding) > 0)
);
create index source_chunks_workspace_id_idx on public.source_chunks(workspace_id);
create index source_chunks_embedding_hnsw_idx on public.source_chunks
  using hnsw (embedding extensions.vector_cosine_ops) where embedding is not null;

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  canvas_id uuid not null unique,
  slug text not null unique default encode(extensions.gen_random_bytes(24), 'hex')
    check (slug ~ '^[A-Za-z0-9_-]{32,128}$'),
  is_active boolean not null default true,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (canvas_id, workspace_id) references public.canvases(id, workspace_id) on delete cascade
);
create index publications_workspace_id_idx on public.publications(workspace_id);

create table public.canvas_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  canvas_id uuid not null,
  data_json jsonb not null check (jsonb_typeof(data_json) = 'object'),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (canvas_id, workspace_id) references public.canvases(id, workspace_id) on delete cascade
);
create index canvas_snapshots_canvas_id_idx on public.canvas_snapshots(canvas_id, created_at desc);
create index canvas_snapshots_workspace_id_idx on public.canvas_snapshots(workspace_id);
create index canvas_snapshots_created_by_idx on public.canvas_snapshots(created_by);

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  request_id uuid not null default gen_random_uuid(),
  request_type text not null check (request_type in ('ask_workspace', 'ask_selection', 'explain', 'summarize', 'rewrite', 'expand', 'diagram', 'embedding')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'error')),
  provider text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_requests_workspace_id_idx on public.ai_requests(workspace_id, created_at desc);
create index ai_requests_user_id_idx on public.ai_requests(user_id);
create index ai_requests_request_id_idx on public.ai_requests(request_id);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  role text not null check (role in ('editor', 'viewer')),
  expires_at timestamptz not null default now() + interval '72 hours',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '72 hours'),
  check (accepted_at is null or revoked_at is null)
);
create index workspace_invitations_workspace_id_idx on public.workspace_invitations(workspace_id);
create unique index workspace_invitations_pending_email_idx on public.workspace_invitations(workspace_id, email)
  where accepted_at is null and revoked_at is null;

-- Private helpers deliberately bypass RLS only for membership lookups, bootstrap
-- triggers, and the narrowly scoped atomic operations defined below. No JWT
-- user_metadata is used for authorization. Every callable authenticated helper
-- resolves auth.uid() itself; caller-supplied user IDs cannot impersonate users.
create function nexora_private.workspace_role(p_workspace_id uuid, p_include_deleted boolean default false)
returns text language sql stable security definer set search_path = '' as $$
  select case when w.owner_id = (select auth.uid()) then 'owner' else m.role end
  from public.workspaces w
  left join public.workspace_members m on m.workspace_id = w.id and m.user_id = (select auth.uid())
  where w.id = p_workspace_id and (select auth.uid()) is not null
    and (w.deleted_at is null or (p_include_deleted and w.owner_id = (select auth.uid())
      and w.deleted_at > now() - interval '30 days'))
$$;
revoke all on function nexora_private.workspace_role(uuid, boolean) from public, anon;
grant execute on function nexora_private.workspace_role(uuid, boolean) to authenticated;

create function nexora_private.shares_workspace(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.workspace_members me
    join public.workspace_members other on other.workspace_id = me.workspace_id
    join public.workspaces w on w.id = me.workspace_id and w.deleted_at is null
    where me.user_id = (select auth.uid()) and other.user_id = p_profile_id
  )
$$;
revoke all on function nexora_private.shares_workspace(uuid) from public, anon;
grant execute on function nexora_private.shares_workspace(uuid) to authenticated;

create function nexora_private.touch_updated_at()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
revoke all on function nexora_private.touch_updated_at() from public, anon, authenticated;

-- Trigger-only functions cannot be invoked through the Data API.
create function nexora_private.bootstrap_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function nexora_private.bootstrap_profile() from public, anon, authenticated;
create trigger nexora_auth_user_created after insert on auth.users
for each row execute function nexora_private.bootstrap_profile();
insert into public.profiles(id) select id from auth.users on conflict (id) do nothing;

create function nexora_private.bootstrap_workspace_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and auth.uid() <> new.owner_id then
    raise exception 'Cannot create a workspace for another user' using errcode = '42501';
  end if;
  insert into public.workspace_members(workspace_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;
revoke all on function nexora_private.bootstrap_workspace_owner() from public, anon, authenticated;
create trigger nexora_workspace_created after insert on public.workspaces
for each row execute function nexora_private.bootstrap_workspace_owner();

create function nexora_private.validate_element_group()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Serialize group edits per canvas so concurrent edits cannot create a cycle.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.canvas_id::text, 0));
  if new.group_id is not null then
    if not exists (select 1 from public.elements e where e.id = new.group_id
      and e.canvas_id = new.canvas_id and e.type = 'group') then
      raise exception 'Group must be a group element on the same canvas' using errcode = '23514';
    end if;
    if exists (
      with recursive parents as (
        select e.id, e.group_id from public.elements e where e.id = new.group_id
        union
        select e.id, e.group_id from public.elements e join parents p on e.id = p.group_id
      ) select 1 from parents where id = new.id
    ) then
      raise exception 'Element groups cannot contain cycles' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.type = 'group' and new.type <> 'group'
    and exists (select 1 from public.elements where group_id = new.id) then
    raise exception 'Ungroup children before changing the group type' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function nexora_private.validate_element_group() from public, anon, authenticated;
create trigger nexora_validate_element_group before insert or update of group_id, type, canvas_id on public.elements
for each row execute function nexora_private.validate_element_group();

do $$
declare t text;
begin
  foreach t in array array['profiles','workspaces','canvases','elements','sources','publications','ai_requests'] loop
    execute format('create trigger nexora_touch_updated_at before update on public.%I for each row execute function nexora_private.touch_updated_at()', t);
  end loop;
end;
$$;

-- Every exposed table gets RLS AND explicit grants. Immutable identity and
-- tenancy columns are never client-updateable, even within the same workspace.
do $$
declare t text;
begin
  foreach t in array array['profiles','workspaces','workspace_members','canvases','elements','sources','source_chunks','publications','canvas_snapshots','ai_requests','workspace_invitations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

grant select on public.profiles to authenticated;
grant update(display_name, avatar_url, preferences_json) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or nexora_private.shares_workspace(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.workspaces to authenticated;
grant insert(id, owner_id, name) on public.workspaces to authenticated;
grant update(name) on public.workspaces to authenticated;
create policy workspaces_read on public.workspaces for select to authenticated
  using ((owner_id = (select auth.uid()) and (deleted_at is null or deleted_at > now() - interval '30 days'))
    or (deleted_at is null and nexora_private.workspace_role(id) is not null));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (owner_id = (select auth.uid()) and deleted_at is null);
create policy workspaces_update on public.workspaces for update to authenticated
  using (nexora_private.workspace_role(id) = 'owner')
  with check (nexora_private.workspace_role(id) = 'owner');
-- No client DELETE: deletion/restoration must use the atomic RPCs below.

grant select on public.workspace_members to authenticated;
grant update(role) on public.workspace_members to authenticated;
grant delete on public.workspace_members to authenticated;
create policy workspace_members_read on public.workspace_members for select to authenticated
  using (nexora_private.workspace_role(workspace_id) is not null);
create policy workspace_members_update on public.workspace_members for update to authenticated
  using (nexora_private.workspace_role(workspace_id) = 'owner' and role <> 'owner')
  with check (nexora_private.workspace_role(workspace_id) = 'owner' and role in ('editor', 'viewer'));
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (nexora_private.workspace_role(workspace_id) = 'owner' and role <> 'owner');
-- Membership INSERT is allowed only by the email-bound acceptance RPC.

grant select on public.canvases, public.elements, public.sources, public.source_chunks,
  public.publications, public.canvas_snapshots to authenticated;
grant insert(id, workspace_id, name, position, background_type, background_spacing) on public.canvases to authenticated;
grant update(name, position, background_type, background_spacing) on public.canvases to authenticated;
grant delete on public.canvases to authenticated;
grant insert(id, workspace_id, canvas_id, type, x, y, width, height, rotation, z_index,
  content_json, style_json, source_id, group_id, created_by) on public.elements to authenticated;
grant update(type, x, y, width, height, rotation, z_index, content_json, style_json, source_id, group_id)
  on public.elements to authenticated;
grant delete on public.elements to authenticated;
grant insert(id, workspace_id, file_path, original_name, mime_type, size, metadata_json, created_by)
  on public.sources to authenticated;
grant update(original_name) on public.sources to authenticated;
grant delete on public.sources to authenticated;
grant insert(id, workspace_id, canvas_id, slug, is_active) on public.publications to authenticated;
grant update(is_active) on public.publications to authenticated;
grant delete on public.publications to authenticated;
grant insert(id, workspace_id, canvas_id, data_json, created_by) on public.canvas_snapshots to authenticated;
grant delete on public.canvas_snapshots to authenticated;

do $$
declare t text;
begin
  foreach t in array array['canvases','elements','sources','publications','canvas_snapshots'] loop
    execute format('create policy %I on public.%I for select to authenticated using (nexora_private.workspace_role(workspace_id) is not null)', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (nexora_private.workspace_role(workspace_id) in (''owner'', ''editor'')%s)', t || '_insert', t,
      case when t in ('elements','sources','canvas_snapshots') then ' and created_by = (select auth.uid())' else '' end);
    if t <> 'canvas_snapshots' then
      execute format('create policy %I on public.%I for update to authenticated using (nexora_private.workspace_role(workspace_id) in (''owner'', ''editor'')) with check (nexora_private.workspace_role(workspace_id) in (''owner'', ''editor''))', t || '_update', t);
    end if;
    execute format('create policy %I on public.%I for delete to authenticated using (nexora_private.workspace_role(workspace_id) in (''owner'', ''editor''))', t || '_delete', t);
  end loop;
end;
$$;
create policy source_chunks_read on public.source_chunks for select to authenticated
  using (nexora_private.workspace_role(workspace_id) is not null);
-- Only the server worker (service_role) writes embeddings, processing states,
-- and AI diagnostic records. A viewer cannot start AI through a table insert.
grant select on public.ai_requests to authenticated;
create policy ai_requests_read on public.ai_requests for select to authenticated
  using (user_id = (select auth.uid()) and nexora_private.workspace_role(workspace_id) in ('owner', 'editor'));

grant select(id, workspace_id, email, role, expires_at, accepted_at, revoked_at, created_at)
  on public.workspace_invitations to authenticated;
create policy workspace_invitations_read on public.workspace_invitations for select to authenticated
  using (nexora_private.workspace_role(workspace_id) = 'owner');

create function nexora_private.soft_delete_workspace(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if auth.uid() is null or nexora_private.workspace_role(p_workspace_id) is distinct from 'owner' then
    raise exception 'Only the owner can delete an active workspace' using errcode = '42501';
  end if;
  update public.workspaces set deleted_at = now() where id = p_workspace_id;
end;
$$;
create function nexora_private.restore_workspace(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if auth.uid() is null or not exists (select 1 from public.workspaces where id = p_workspace_id
    and owner_id = auth.uid() and deleted_at > now() - interval '30 days') then
    raise exception 'Workspace cannot be restored' using errcode = '42501';
  end if;
  update public.workspaces set deleted_at = null where id = p_workspace_id;
end;
$$;
create function nexora_private.transfer_workspace_ownership(p_workspace_id uuid, p_new_owner_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if auth.uid() is null or nexora_private.workspace_role(p_workspace_id) is distinct from 'owner'
    or p_new_owner_id = auth.uid() then
    raise exception 'Only the owner can transfer ownership to another member' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_new_owner_id) then
    raise exception 'New owner must already be a member' using errcode = '23514';
  end if;
  update public.workspace_members set role = 'editor' where workspace_id = p_workspace_id and user_id = auth.uid();
  update public.workspace_members set role = 'owner' where workspace_id = p_workspace_id and user_id = p_new_owner_id;
  update public.workspaces set owner_id = p_new_owner_id where id = p_workspace_id;
end;
$$;

create function nexora_private.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role text)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(p_email)); v_token text; v_id uuid; v_expires timestamptz;
begin
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if auth.uid() is null or nexora_private.workspace_role(p_workspace_id) is distinct from 'owner' then
    raise exception 'Only the owner can invite members' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('editor', 'viewer') then
    raise exception 'Invitation role must be editor or viewer' using errcode = '23514';
  end if;
  if exists (select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id and lower(u.email) = v_email) then
    raise exception 'Пользователь уже является участником' using errcode = '23505';
  end if;
  update public.workspace_invitations set revoked_at = now()
    where workspace_id = p_workspace_id and email = v_email and accepted_at is null
      and revoked_at is null and workspace_invitations.expires_at <= now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.workspace_invitations(workspace_id, email, token_hash, role)
    values (p_workspace_id, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_role)
    returning id, workspace_invitations.expires_at into v_id, v_expires;
  return query select v_id, v_token, v_expires;
end;
$$;

create function nexora_private.accept_workspace_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.workspace_invitations; v_email text; v_workspace uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select i.workspace_id into v_workspace from public.workspace_invitations i
    where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  perform 1 from public.workspaces where id = v_workspace and deleted_at is null for update;
  if not found then raise exception 'Invalid invitation' using errcode = '42501'; end if;
  select * into v_inv from public.workspace_invitations i
    where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null or v_email <> v_inv.email or v_inv.expires_at <= now()
    or v_inv.accepted_at is not null or v_inv.revoked_at is not null then
    raise exception 'Invalid, expired, revoked, or mismatched invitation' using errcode = '42501';
  end if;
  insert into public.workspace_members(workspace_id, user_id, role) values (v_inv.workspace_id, auth.uid(), v_inv.role);
  update public.workspace_invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.workspace_id;
end;
$$;

create function nexora_private.revoke_workspace_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_workspace uuid;
begin
  select workspace_id into v_workspace from public.workspace_invitations where id = p_invitation_id;
  perform 1 from public.workspaces where id = v_workspace for update;
  if auth.uid() is null or nexora_private.workspace_role(v_workspace) is distinct from 'owner' then
    raise exception 'Only the owner can revoke invitations' using errcode = '42501';
  end if;
  update public.workspace_invitations set revoked_at = now()
    where id = p_invitation_id and accepted_at is null and revoked_at is null;
end;
$$;

-- Thin invoker wrappers expose only these specific operations through RPC.
create function public.soft_delete_workspace(p_workspace_id uuid) returns void
  language sql security invoker set search_path = '' as $$ select nexora_private.soft_delete_workspace(p_workspace_id) $$;
create function public.restore_workspace(p_workspace_id uuid) returns void
  language sql security invoker set search_path = '' as $$ select nexora_private.restore_workspace(p_workspace_id) $$;
create function public.transfer_workspace_ownership(p_workspace_id uuid, p_new_owner_id uuid) returns void
  language sql security invoker set search_path = '' as $$ select nexora_private.transfer_workspace_ownership(p_workspace_id, p_new_owner_id) $$;
create function public.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role text)
  returns table (invitation_id uuid, token text, expires_at timestamptz)
  language sql security invoker set search_path = '' as $$ select * from nexora_private.create_workspace_invitation(p_workspace_id, p_email, p_role) $$;
create function public.accept_workspace_invitation(p_token text) returns uuid
  language sql security invoker set search_path = '' as $$ select nexora_private.accept_workspace_invitation(p_token) $$;
create function public.revoke_workspace_invitation(p_invitation_id uuid) returns void
  language sql security invoker set search_path = '' as $$ select nexora_private.revoke_workspace_invitation(p_invitation_id) $$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'soft_delete_workspace(uuid)', 'restore_workspace(uuid)', 'transfer_workspace_ownership(uuid,uuid)',
    'create_workspace_invitation(uuid,text,text)', 'accept_workspace_invitation(text)', 'revoke_workspace_invitation(uuid)'
  ] loop
    execute 'revoke all on function nexora_private.' || signature || ' from public, anon, authenticated';
    execute 'grant execute on function nexora_private.' || signature || ' to authenticated';
    execute 'revoke all on function public.' || signature || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || signature || ' to authenticated';
  end loop;
end;
$$;

create function public.match_source_chunks(p_workspace_id uuid, p_embedding extensions.vector(1536), p_limit integer default 5)
returns table (id uuid, source_id uuid, content text, page_ref text, "position" integer, similarity double precision)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or nexora_private.workspace_role(p_workspace_id) is null then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  if p_embedding is null or extensions.vector_dims(p_embedding) <> 1536 or extensions.vector_norm(p_embedding) = 0 then
    raise exception 'A nonzero 1536-dimensional embedding is required' using errcode = '22023';
  end if;
  return query select c.id, c.source_id, c.content, c.page_ref, c.position,
    1 - (c.embedding operator(extensions.<=>) p_embedding)
  from public.source_chunks c
  where c.workspace_id = p_workspace_id and c.embedding is not null
  order by c.embedding operator(extensions.<=>) p_embedding, c.id
  limit least(greatest(coalesce(p_limit, 5), 1), 5);
end;
$$;
revoke all on function public.match_source_chunks(uuid, extensions.vector, integer) from public, anon;
grant execute on function public.match_source_chunks(uuid, extensions.vector, integer) to authenticated;

-- Public access is a capability (high-entropy slug), not raw table SELECT.
-- The definer is private and exposes a whitelist, never private files/chunks,
-- storage paths, source IDs, invitation hashes, snapshots, or AI history.
create function nexora_private.get_published_canvas(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', c.name, 'background_type', c.background_type, 'background_spacing', c.background_spacing,
    'elements', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'type', e.type, 'x', e.x, 'y', e.y, 'width', e.width, 'height', e.height,
      'rotation', e.rotation, 'z_index', e.z_index, 'group_id', e.group_id,
      'content_json', case
        when e.type in ('text', 'note', 'diagram_node') then jsonb_build_object('text', e.content_json->>'text')
        when e.type = 'formula' then jsonb_build_object('latex', e.content_json->>'latex')
        when e.type = 'shape' then jsonb_build_object('shape', e.content_json->>'shape', 'text', e.content_json->>'text')
        when e.type = 'connector' then jsonb_build_object('start_id', e.content_json->>'start_id', 'end_id', e.content_json->>'end_id')
        else '{}'::jsonb end,
      'style_json', (select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
        from jsonb_each(e.style_json) s where s.key in ('color','fill','stroke','font_size','font_weight','text_align','opacity')
          and jsonb_typeof(s.value) in ('string','number'))
    ) order by e.z_index, e.id) from public.elements e where e.canvas_id = c.id), '[]'::jsonb)
  ) from public.publications p
  join public.canvases c on c.id = p.canvas_id
  join public.workspaces w on w.id = c.workspace_id
  where p.slug = p_slug and p.is_active and w.deleted_at is null
$$;
revoke all on function nexora_private.get_published_canvas(text) from public;
grant execute on function nexora_private.get_published_canvas(text) to anon, authenticated;
create function public.get_published_canvas(p_slug text) returns jsonb
language sql stable security invoker set search_path = '' as $$ select nexora_private.get_published_canvas(p_slug) $$;
revoke all on function public.get_published_canvas(text) from public;
grant execute on function public.get_published_canvas(text) to anon, authenticated;

comment on column public.workspaces.deleted_at is 'Soft deletion: all children and publications become inaccessible immediately; owner recovery window is 30 days.';
comment on column public.source_chunks.position is 'Zero-based fragment order within a source; unique with source_id.';
comment on column public.canvases.position is 'Stable display order within a workspace; ties resolved by id.';
comment on column public.elements.group_id is 'Parent group element on the same canvas; deleting a group ungroups children.';
comment on column public.source_chunks.embedding is '1536 dimensions; changing embedding model/dimension requires a new migration and reindexing.';
comment on function public.get_published_canvas(text) is 'Safe public projection by active random slug. Private source and image files are not exposed; image publishing needs a separately sanitized asset pipeline.';

-- Original files are private. The Storage API enforces these policies for reads,
-- uploads, replacements (SELECT + INSERT + UPDATE), and deletion.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('nexora-sources', 'nexora-sources', false, 26214400, array[
  'application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/markdown', 'image/png', 'image/jpeg'
]);
create policy nexora_sources_read on storage.objects for select to authenticated
  using (bucket_id = 'nexora-sources' and exists (
    select 1 from public.sources s where s.file_path = name
      and nexora_private.workspace_role(s.workspace_id) is not null
  ));
create policy nexora_sources_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'nexora-sources' and exists (
    select 1 from public.sources s where s.file_path = name
      and nexora_private.workspace_role(s.workspace_id) in ('owner', 'editor')
  ));
create policy nexora_sources_update on storage.objects for update to authenticated
  using (bucket_id = 'nexora-sources' and exists (
    select 1 from public.sources s where s.file_path = name
      and nexora_private.workspace_role(s.workspace_id) in ('owner', 'editor')
  )) with check (bucket_id = 'nexora-sources' and exists (
    select 1 from public.sources s where s.file_path = name
      and nexora_private.workspace_role(s.workspace_id) in ('owner', 'editor')
  ));
create policy nexora_sources_delete on storage.objects for delete to authenticated
  using (bucket_id = 'nexora-sources' and exists (
    select 1 from public.sources s where s.file_path = name
      and nexora_private.workspace_role(s.workspace_id) in ('owner', 'editor')
  ));

