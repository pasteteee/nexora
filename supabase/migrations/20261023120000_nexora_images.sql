-- Спринт 4 (#24): изображения на холсте хранятся в приватном бакете тетради
-- и не индексируются как источники (ТЗ 4.2.5). Путь: <workspace_id>/<uuid>/<имя файла>.

create function nexora_private.storage_workspace(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid end
$$;
revoke all on function nexora_private.storage_workspace(text) from public, anon;
grant execute on function nexora_private.storage_workspace(text) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('nexora-images', 'nexora-images', false, 26214400, array['image/png', 'image/jpeg', 'image/webp']);

create policy nexora_images_read on storage.objects for select to authenticated
  using (bucket_id = 'nexora-images'
    and nexora_private.workspace_role(nexora_private.storage_workspace(name)) is not null);
create policy nexora_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'nexora-images'
    and nexora_private.workspace_role(nexora_private.storage_workspace(name)) in ('owner', 'editor'));
create policy nexora_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'nexora-images'
    and nexora_private.workspace_role(nexora_private.storage_workspace(name)) in ('owner', 'editor'));
