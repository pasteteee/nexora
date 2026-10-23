-- RLS по матрице прав (ТЗ, Приложение 2). Права не слабее матрицы.
create function ws_role(ws uuid) returns workspace_role
language sql stable security definer set search_path = public as $$
  select m.role from workspace_members m
  join workspaces w on w.id = m.workspace_id
  where m.workspace_id = ws and m.user_id = auth.uid() and w.deleted_at is null
$$;

create function ws_can_edit(ws uuid) returns boolean language sql stable as $$
  select coalesce(ws_role(ws) in ('owner', 'editor'), false)
$$;

create function canvas_ws(c uuid) returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from canvases where id = c
$$;

alter table profiles enable row level security;
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table workspace_invitations enable row level security;
alter table canvases enable row level security;
alter table elements enable row level security;
alter table sources enable row level security;
alter table source_chunks enable row level security;
alter table publications enable row level security;
alter table canvas_snapshots enable row level security;
alter table ai_requests enable row level security;

create policy profiles_self on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_coworkers on profiles for select using (
  exists (select 1 from workspace_members a join workspace_members b using (workspace_id)
          where a.user_id = auth.uid() and b.user_id = profiles.id));

-- Тетради: видят участники; в корзине — только владелец
create policy ws_select on workspaces for select using (
  ws_role(id) is not null or (owner_id = auth.uid()));
create policy ws_insert on workspaces for insert with check (owner_id = auth.uid());
create policy ws_update on workspaces for update using (owner_id = auth.uid());
create policy ws_delete on workspaces for delete using (owner_id = auth.uid());

create policy members_select on workspace_members for select using (ws_role(workspace_id) is not null);
create policy members_owner on workspace_members for all
  using (ws_role(workspace_id) = 'owner') with check (ws_role(workspace_id) = 'owner');

create policy invitations_owner on workspace_invitations for all
  using (ws_role(workspace_id) = 'owner') with check (ws_role(workspace_id) = 'owner');

create policy canvases_select on canvases for select using (ws_role(workspace_id) is not null);
create policy canvases_write on canvases for all
  using (ws_can_edit(workspace_id)) with check (ws_can_edit(workspace_id));

create policy elements_select on elements for select using (ws_role(canvas_ws(canvas_id)) is not null);
create policy elements_write on elements for all
  using (ws_can_edit(canvas_ws(canvas_id))) with check (ws_can_edit(canvas_ws(canvas_id)));

create policy sources_select on sources for select using (ws_role(workspace_id) is not null);
create policy sources_write on sources for all
  using (ws_can_edit(workspace_id)) with check (ws_can_edit(workspace_id));

create policy chunks_select on source_chunks for select using (
  exists (select 1 from sources s where s.id = source_id and ws_role(s.workspace_id) is not null));

create policy publications_select on publications for select using (ws_role(canvas_ws(canvas_id)) is not null);
create policy publications_write on publications for all
  using (ws_can_edit(canvas_ws(canvas_id))) with check (ws_can_edit(canvas_ws(canvas_id)));

create policy snapshots_rw on canvas_snapshots for all
  using (ws_can_edit(canvas_ws(canvas_id))) with check (ws_can_edit(canvas_ws(canvas_id)));

-- ai_requests пишет только сервер (service role), пользователь читает свои
create policy ai_requests_own on ai_requests for select using (user_id = auth.uid());
