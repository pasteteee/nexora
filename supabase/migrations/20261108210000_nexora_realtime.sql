-- Nexora: Realtime-синхронизация объектов и присутствие (карточка Trello #36, ТЗ 4.2.9, 4.3.1.2).
--
-- Сервер сам рассылает подтвержденные изменения: после записи в public.elements
-- триггер отправляет строку с серверным updated_at в приватный канал страницы
-- `page:<canvas_id>`. Клиенты применяют её по правилу last-write-wins. Клиент не
-- может писать в этот канал, поэтому наблюдатель или посторонний не подделает
-- объектную операцию. Presence и курсоры идут через отдельный канал
-- `page:<canvas_id>:live`, в который пишут все участники тетради, включая наблюдателя.
-- Смена роли или исключение участника приходит в личный канал `member:<user_id>`.
--
-- Публикация supabase_realtime не используется: postgres_changes не умеет
-- фильтровать DELETE и проверять для него RLS, а realtime.send проходит через
-- авторизацию realtime.messages.

-- Роль текущего пользователя в тетради, к которой относится тема канала страницы.
create function nexora_private.page_topic_role(p_topic text)
returns text language sql stable security definer set search_path = '' as $$
  select nexora_private.workspace_role(c.workspace_id)
  from public.canvases c
  where c.deleted_at is null
    and c.id = case
      when p_topic ~ '^page:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:live)?$'
      then substring(p_topic from 6 for 36)::uuid
    end
$$;
revoke all on function nexora_private.page_topic_role(text) from public, anon;
grant execute on function nexora_private.page_topic_role(text) to authenticated;

-- Чтение: каналы страниц — только участникам тетради, личный канал — только владельцу.
create policy nexora_realtime_read on realtime.messages for select to authenticated using (
  (realtime.messages.extension in ('broadcast', 'presence')
    and nexora_private.page_topic_role((select realtime.topic())) is not null)
  or (realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) = 'member:' || (select auth.uid())::text)
);

-- Запись с клиента: только presence и курсоры в живом канале своей страницы.
create policy nexora_realtime_write on realtime.messages for insert to authenticated with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and (select realtime.topic()) like 'page:%:live'
  and nexora_private.page_topic_role((select realtime.topic())) is not null
);

-- Сбой рассылки не должен откатывать сохранение: Realtime не источник истины,
-- клиенты дозагружают состояние из БД при переподключении.
create function nexora_private.broadcast_element_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if tg_op in ('DELETE', 'UPDATE') and (tg_op = 'DELETE' or old.canvas_id <> new.canvas_id) then
      perform realtime.send(jsonb_build_object('op', 'delete', 'id', old.id, 'at', now()),
        'element', 'page:' || old.canvas_id::text, true);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      perform realtime.send(jsonb_build_object('op', 'upsert', 'row', to_jsonb(new)),
        'element', 'page:' || new.canvas_id::text, true);
    end if;
  exception when others then
    raise warning 'nexora realtime: element broadcast failed: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function nexora_private.broadcast_element_change() from public, anon, authenticated;
create trigger nexora_broadcast_element_change after insert or update or delete on public.elements
for each row execute function nexora_private.broadcast_element_change();

-- Смена роли и исключение участника (ТЗ: применяется не дольше чем за 2 с).
create function nexora_private.broadcast_member_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform realtime.send(jsonb_build_object('workspace_id', old.workspace_id, 'role', null),
        'role', 'member:' || old.user_id::text, true);
    elsif tg_op = 'INSERT' or new.role is distinct from old.role then
      perform realtime.send(jsonb_build_object('workspace_id', new.workspace_id, 'role', new.role),
        'role', 'member:' || new.user_id::text, true);
    end if;
  exception when others then
    raise warning 'nexora realtime: member broadcast failed: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function nexora_private.broadcast_member_change() from public, anon, authenticated;
create trigger nexora_broadcast_member_change after insert or update of role or delete on public.workspace_members
for each row execute function nexora_private.broadcast_member_change();

-- Удаление тетради сразу отзывает доступ у всех открытых страниц, восстановление возвращает роли.
create function nexora_private.broadcast_workspace_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is distinct from old.deleted_at then
    begin
      perform realtime.send(jsonb_build_object('workspace_id', new.id,
          'role', case when new.deleted_at is null then m.role end),
        'role', 'member:' || m.user_id::text, true)
      from public.workspace_members m where m.workspace_id = new.id;
    exception when others then
      raise warning 'nexora realtime: workspace broadcast failed: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function nexora_private.broadcast_workspace_access() from public, anon, authenticated;
create trigger nexora_broadcast_workspace_access after update of deleted_at on public.workspaces
for each row execute function nexora_private.broadcast_workspace_access();
