-- Nexora: схема первой очереди (ТЗ, Приложение 1) + индексы п. 4.3.1.3
create extension if not exists "pgcrypto";
create extension if not exists "vector";

create type workspace_role as enum ('owner', 'editor', 'viewer');
create type source_status as enum ('uploading', 'queued', 'processing', 'ready', 'error', 'ocr_required');
create type background_type as enum ('plain', 'grid', 'dots', 'lines');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  name text not null default 'Новая тетрадь' check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role workspace_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_ws_user_idx on workspace_members (workspace_id, user_id);

create table workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  role workspace_role not null check (role <> 'owner'),
  expires_at timestamptz not null default now() + interval '72 hours',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table canvases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  background_type background_type not null default 'grid',
  background_spacing smallint not null default 24 check (background_spacing in (16, 24, 32, 48)),
  position double precision not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index canvases_ws_idx on canvases (workspace_id, position);

create table sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  file_path text not null,
  original_name text not null,
  mime_type text not null,
  size bigint not null check (size > 0),
  status source_status not null default 'uploading',
  metadata_json jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now()
);
create index sources_ws_idx on sources (workspace_id);

create table elements (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references canvases(id) on delete cascade,
  type text not null check (type in
    ('text','note','image','formula','shape','connector','node','source_link','source_fragment')),
  x double precision not null,
  y double precision not null,
  width double precision not null,
  height double precision not null,
  rotation double precision not null default 0,
  z_index integer not null default 0,
  content_json jsonb not null default '{}',
  style_json jsonb not null default '{}',
  source_id uuid references sources(id) on delete set null,
  group_id uuid,
  created_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
create index elements_canvas_idx on elements (canvas_id);

create table source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  content text not null,
  page_ref integer,
  embedding vector(1536),
  metadata_json jsonb not null default '{}'
);
create index source_chunks_embedding_idx on source_chunks using hnsw (embedding vector_cosine_ops);

create table publications (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references canvases(id) on delete cascade,
  slug text not null,
  is_active boolean not null default true,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index publications_slug_idx on publications (slug);

create table canvas_snapshots (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references canvases(id) on delete cascade,
  data_json jsonb not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table ai_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  request_type text not null,
  status text not null,
  provider text,
  error_message text,
  created_at timestamptz not null default now()
);

-- updated_at
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger workspaces_touch before update on workspaces for each row execute function touch_updated_at();
create trigger canvases_touch before update on canvases for each row execute function touch_updated_at();
create trigger elements_touch before update on elements for each row execute function touch_updated_at();
create trigger publications_touch before update on publications for each row execute function touch_updated_at();

-- Владелец автоматически становится участником с ролью owner
create function add_owner_membership() returns trigger language plpgsql security definer as $$
begin
  insert into workspace_members (workspace_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
create trigger workspaces_owner after insert on workspaces for each row execute function add_owner_membership();

-- Удаление тетради: публикации отключаются сразу (п. 4.1.3)
create function disable_publications_on_trash() returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update publications p set is_active = false
      from canvases c where c.id = p.canvas_id and c.workspace_id = new.id;
  end if;
  return new;
end $$;
create trigger workspaces_trash after update of deleted_at on workspaces
  for each row execute function disable_publications_on_trash();
