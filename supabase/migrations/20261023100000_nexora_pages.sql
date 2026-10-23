-- Спринт 2 (#9, #15): имя профиля при регистрации, корзина страниц, дублирование страницы.

-- Профиль получает имя из формы регистрации (user_metadata.display_name)
create or replace function nexora_private.bootstrap_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'), ''), ''), 120))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function nexora_private.bootstrap_profile() from public, anon, authenticated;

-- Корзина страниц: удалённая страница скрыта 30 дней и восстанавливается редактором
alter table public.canvases add column deleted_at timestamptz;
create index canvases_deleted_at_idx on public.canvases(deleted_at) where deleted_at is not null;
grant update(deleted_at) on public.canvases to authenticated;

-- Дублирование страницы со всеми объектами в одной транзакции.
-- Группы — это объекты типа group, поэтому group_id переназначается той же картой id, что и связи.
create function public.duplicate_canvas(p_canvas_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  c public.canvases;
  v_id uuid;
begin
  select * into c from public.canvases where id = p_canvas_id and deleted_at is null;
  if not found or nexora_private.workspace_role(c.workspace_id) not in ('owner', 'editor') then
    raise exception 'Canvas not found' using errcode = '42501';
  end if;

  update public.canvases set position = position + 1
  where workspace_id = c.workspace_id and position > c.position;
  insert into public.canvases (workspace_id, name, position, background_type, background_spacing)
  values (c.workspace_id, left(c.name || ' (копия)', 200), c.position + 1, c.background_type, c.background_spacing)
  returning id into v_id;

  create temporary table if not exists pg_temp.nexora_id_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  delete from pg_temp.nexora_id_map;
  insert into pg_temp.nexora_id_map
    select e.id, gen_random_uuid() from public.elements e where e.canvas_id = p_canvas_id;

  -- сначала группы, затем остальные: проверка group_id требует существующую группу
  insert into public.elements (id, workspace_id, canvas_id, type, x, y, width, height, rotation, z_index,
    content_json, style_json, source_id, group_id, created_by)
  select m.new_id, c.workspace_id, v_id, e.type, e.x, e.y, e.width, e.height, e.rotation, e.z_index,
    e.content_json
      || case when e.content_json ? 'fromId' then jsonb_build_object('fromId', (select i.new_id from pg_temp.nexora_id_map i where i.old_id::text = e.content_json->>'fromId')) else '{}'::jsonb end
      || case when e.content_json ? 'toId' then jsonb_build_object('toId', (select i.new_id from pg_temp.nexora_id_map i where i.old_id::text = e.content_json->>'toId')) else '{}'::jsonb end,
    e.style_json, e.source_id, g.new_id, auth.uid()
  from public.elements e
  join pg_temp.nexora_id_map m on m.old_id = e.id
  left join pg_temp.nexora_id_map g on g.old_id = e.group_id
  where e.canvas_id = p_canvas_id
  order by (e.type = 'group') desc, e.z_index;

  return v_id;
end;
$$;
revoke all on function public.duplicate_canvas(uuid) from public, anon;
grant execute on function public.duplicate_canvas(uuid) to authenticated;
