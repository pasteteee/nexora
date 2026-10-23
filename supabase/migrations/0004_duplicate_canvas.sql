-- Дублирование страницы со всеми элементами (ТЗ 4.2.5): новые id, группы и связи переназначаются
create function duplicate_canvas(src uuid) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  c canvases;
  v_id uuid;
begin
  select * into c from canvases where id = src and deleted_at is null;
  if not found or not ws_can_edit(c.workspace_id) then
    raise exception 'not found' using errcode = 'PGRST116';
  end if;

  update canvases set position = position + 1 where workspace_id = c.workspace_id and position > c.position;
  insert into canvases (workspace_id, name, background_type, background_spacing, position)
  values (c.workspace_id, left(c.name || ' (копия)', 100), c.background_type, c.background_spacing, c.position + 1)
  returning id into v_id;

  create temp table id_map on commit drop as
    select id as old_id, gen_random_uuid() as new_id from elements where canvas_id = src;
  create temp table group_map on commit drop as
    select g as old_id, gen_random_uuid() as new_id from (select distinct group_id g from elements where canvas_id = src and group_id is not null) x;

  insert into elements (id, canvas_id, type, x, y, width, height, rotation, z_index, content_json, style_json, source_id, group_id, created_by)
  select m.new_id, v_id, e.type, e.x, e.y, e.width, e.height, e.rotation, e.z_index,
         e.content_json
           || case when e.content_json ? 'fromId' then jsonb_build_object('fromId', (select i.new_id from id_map i where i.old_id::text = e.content_json->>'fromId')) else '{}' end
           || case when e.content_json ? 'toId' then jsonb_build_object('toId', (select i.new_id from id_map i where i.old_id::text = e.content_json->>'toId')) else '{}' end,
         e.style_json, e.source_id, g.new_id, auth.uid()
  from elements e
  join id_map m on m.old_id = e.id
  left join group_map g on g.old_id = e.group_id
  where e.canvas_id = src;

  return v_id;
end $$;
