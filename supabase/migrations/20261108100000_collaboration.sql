-- Спринт 6 (#35): участники, приглашения, роли, передача владения и публикации.
-- Права проверяются здесь, в базе; интерфейс только скрывает недоступные действия.

-- 1. Участники с именем и e-mail. E-mail других участников видит только владелец.
create function nexora_private.list_workspace_members(p_workspace_id uuid)
returns table (user_id uuid, display_name text, email text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_role text := nexora_private.workspace_role(p_workspace_id);
begin
  if auth.uid() is null or v_role is null then
    raise exception 'Workspace not found' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.display_name,
      case when v_role = 'owner' or m.user_id = auth.uid() then u.email::text else null end,
      m.role, m.created_at
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    left join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id
    order by case m.role when 'owner' then 0 when 'editor' then 1 else 2 end, m.created_at, m.user_id;
end;
$$;
create function public.list_workspace_members(p_workspace_id uuid)
returns table (user_id uuid, display_name text, email text, role text, joined_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from nexora_private.list_workspace_members(p_workspace_id)
$$;

-- 2. Повторное приглашение того же адреса заменяет прежнее: старый токен отзывается.
create or replace function nexora_private.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role text)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(p_email)); v_token text; v_id uuid; v_expires timestamptz;
begin
  perform 1 from public.workspaces where id = p_workspace_id and deleted_at is null for update;
  if auth.uid() is null or nexora_private.workspace_role(p_workspace_id) is distinct from 'owner' then
    raise exception 'Only the owner can invite members' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('editor', 'viewer') then
    raise exception 'Invitation role must be editor or viewer' using errcode = '23514';
  end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(v_email) > 320 then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  if exists (select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace_id and lower(u.email) = v_email) then
    raise exception 'Пользователь уже является участником' using errcode = '23505';
  end if;
  update public.workspace_invitations set revoked_at = now()
    where workspace_id = p_workspace_id and email = v_email and accepted_at is null and revoked_at is null;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.workspace_invitations(workspace_id, email, token_hash, role)
    values (p_workspace_id, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), p_role)
    returning id, workspace_invitations.expires_at into v_id, v_expires;
  return query select v_id, v_token, v_expires;
end;
$$;

-- 3. Принять приглашение может только владелец адреса. После отключения
-- обязательного подтверждения auth.users.email_confirmed_at означает лишь
-- «вход разрешён», поэтому доказательство владения — profiles.email_verified_at.
-- Ошибки различимы для интерфейса, но не раскрывают чужие данные.
create or replace function nexora_private.accept_workspace_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv public.workspace_invitations; v_email text; v_verified timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_inv from public.workspace_invitations i
    where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') for update;
  if not found then raise exception 'invitation_invalid' using errcode = '42501'; end if;
  perform 1 from public.workspaces where id = v_inv.workspace_id and deleted_at is null for update;
  if not found then raise exception 'invitation_invalid' using errcode = '42501'; end if;
  select lower(u.email), p.email_verified_at into v_email, v_verified
    from auth.users u join public.profiles p on p.id = u.id where u.id = auth.uid();
  if v_inv.revoked_at is not null then raise exception 'invitation_revoked' using errcode = '42501'; end if;
  if v_inv.accepted_at is not null then raise exception 'invitation_used' using errcode = '42501'; end if;
  if v_inv.expires_at <= now() then raise exception 'invitation_expired' using errcode = '42501'; end if;
  if v_email is distinct from v_inv.email then raise exception 'invitation_email_mismatch' using errcode = '42501'; end if;
  if v_verified is null then raise exception 'invitation_email_unverified' using errcode = '42501'; end if;
  if exists (select 1 from public.workspace_members where workspace_id = v_inv.workspace_id and user_id = auth.uid()) then
    update public.workspace_invitations set accepted_at = now() where id = v_inv.id;
    return v_inv.workspace_id;
  end if;
  insert into public.workspace_members(workspace_id, user_id, role) values (v_inv.workspace_id, auth.uid(), v_inv.role);
  update public.workspace_invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.workspace_id;
end;
$$;

-- 4. Смена роли и исключение — одной проверенной операцией (владельца не трогаем).
create function nexora_private.set_member_role(p_workspace_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id = p_workspace_id and deleted_at is null for update;
  if auth.uid() is null or nexora_private.workspace_role(p_workspace_id) is distinct from 'owner' then
    raise exception 'Only the owner can change roles' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('editor', 'viewer') then
    raise exception 'Role must be editor or viewer' using errcode = '23514';
  end if;
  update public.workspace_members set role = p_role
    where workspace_id = p_workspace_id and user_id = p_user_id and role <> 'owner';
  if not found then raise exception 'Member not found' using errcode = 'P0002'; end if;
end;
$$;
create function nexora_private.remove_workspace_member(p_workspace_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.workspaces where id = p_workspace_id and deleted_at is null for update;
  -- Участник может выйти сам; исключать других может только владелец. Владелец не выходит.
  if auth.uid() is null or nexora_private.workspace_role(p_workspace_id) is null
    or (p_user_id <> auth.uid() and nexora_private.workspace_role(p_workspace_id) <> 'owner') then
    raise exception 'Only the owner can remove members' using errcode = '42501';
  end if;
  delete from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id and role <> 'owner';
  if not found then raise exception 'Member not found' using errcode = 'P0002'; end if;
end;
$$;
create function public.set_member_role(p_workspace_id uuid, p_user_id uuid, p_role text) returns void
  language sql security invoker set search_path = '' as $$ select nexora_private.set_member_role(p_workspace_id, p_user_id, p_role) $$;
create function public.remove_workspace_member(p_workspace_id uuid, p_user_id uuid) returns void
  language sql security invoker set search_path = '' as $$ select nexora_private.remove_workspace_member(p_workspace_id, p_user_id) $$;

-- 5. Публикация (Приложение 2: владелец и редактор). Повторная публикация после
-- отключения выдаёт новую ссылку, чтобы старая не начала снова работать.
create function nexora_private.publish_canvas(p_canvas_id uuid)
returns table (slug text, is_active boolean, published_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_ws uuid; v_pub public.publications;
begin
  select c.workspace_id into v_ws from public.canvases c
    join public.workspaces w on w.id = c.workspace_id
    where c.id = p_canvas_id and c.deleted_at is null and w.deleted_at is null;
  if auth.uid() is null or v_ws is null or coalesce(nexora_private.workspace_role(v_ws), '') not in ('owner', 'editor') then
    raise exception 'Page not found or not editable' using errcode = '42501';
  end if;
  select * into v_pub from public.publications p where p.canvas_id = p_canvas_id for update;
  if not found then
    insert into public.publications(workspace_id, canvas_id) values (v_ws, p_canvas_id) returning * into v_pub;
  elsif not v_pub.is_active then
    update public.publications p set is_active = true, published_at = now(),
      slug = encode(extensions.gen_random_bytes(24), 'hex')
      where p.id = v_pub.id returning * into v_pub;
  end if;
  return query select v_pub.slug, v_pub.is_active, v_pub.published_at;
end;
$$;
create function nexora_private.unpublish_canvas(p_canvas_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_ws uuid;
begin
  select workspace_id into v_ws from public.canvases where id = p_canvas_id;
  if auth.uid() is null or v_ws is null or coalesce(nexora_private.workspace_role(v_ws), '') not in ('owner', 'editor') then
    raise exception 'Page not found or not editable' using errcode = '42501';
  end if;
  update public.publications set is_active = false where canvas_id = p_canvas_id and is_active;
end;
$$;
create function public.publish_canvas(p_canvas_id uuid)
returns table (slug text, is_active boolean, published_at timestamptz)
  language sql security invoker set search_path = '' as $$ select * from nexora_private.publish_canvas(p_canvas_id) $$;
create function public.unpublish_canvas(p_canvas_id uuid) returns void
  language sql security invoker set search_path = '' as $$ select nexora_private.unpublish_canvas(p_canvas_id) $$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'list_workspace_members(uuid)', 'set_member_role(uuid,uuid,text)', 'remove_workspace_member(uuid,uuid)',
    'publish_canvas(uuid)', 'unpublish_canvas(uuid)',
    'create_workspace_invitation(uuid,text,text)', 'accept_workspace_invitation(text)'
  ] loop
    execute 'revoke all on function nexora_private.' || signature || ' from public, anon, authenticated';
    execute 'grant execute on function nexora_private.' || signature || ' to authenticated';
    execute 'revoke all on function public.' || signature || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || signature || ' to authenticated';
  end loop;
end;
$$;

-- 6. Публичная проекция: страница в корзине не публикуется; поля совпадают с тем,
-- что пишет документный редактор (documentOrder, kind, стили в camelCase).
-- Изображения и источники по-прежнему не раскрываются.
create or replace function nexora_private.get_published_canvas(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', c.name, 'background_type', c.background_type, 'background_spacing', c.background_spacing,
    'elements', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'type', e.type, 'x', e.x, 'y', e.y, 'width', e.width, 'height', e.height,
      'rotation', e.rotation, 'z_index', e.z_index, 'group_id', e.group_id,
      'content_json', jsonb_strip_nulls(case
        when e.type in ('text', 'note', 'diagram_node') then jsonb_build_object('text', e.content_json->>'text')
        when e.type = 'formula' then jsonb_build_object('latex', e.content_json->>'latex')
        when e.type = 'shape' then jsonb_build_object('kind', coalesce(e.content_json->>'kind', e.content_json->>'shape'), 'text', e.content_json->>'text')
        when e.type = 'connector' then jsonb_build_object('fromId', e.content_json->>'fromId', 'toId', e.content_json->>'toId')
        else '{}'::jsonb end
        || case when jsonb_typeof(e.content_json->'documentOrder') = 'number'
          then jsonb_build_object('documentOrder', e.content_json->'documentOrder') else '{}'::jsonb end),
      'style_json', (select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
        from jsonb_each(e.style_json) s
        where s.key in ('color', 'fill', 'stroke', 'fontSize', 'fontWeight', 'align', 'bold', 'italic',
            'underline', 'strike', 'opacity', 'font_size', 'font_weight', 'text_align')
          and jsonb_typeof(s.value) in ('string', 'number', 'boolean'))
    ) order by e.z_index, e.id) from public.elements e
      where e.canvas_id = c.id and e.type not in ('image', 'source', 'source_fragment')), '[]'::jsonb)
  ) from public.publications p
  join public.canvases c on c.id = p.canvas_id and c.deleted_at is null
  join public.workspaces w on w.id = c.workspace_id
  where p.slug = p_slug and p.is_active and w.deleted_at is null
$$;
