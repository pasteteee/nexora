-- Worker downloads use privileged Storage access after membership checks.
-- Restrict the object key to one literal filename within the source's folder;
-- no URL normalization, encoded traversal or extra path segments are allowed.
alter table public.sources add constraint sources_literal_storage_key check (
  file_path ~ ('^' || workspace_id::text || '/' || id::text || '/[A-Za-z0-9_.-]{1,120}$')
  and split_part(file_path, '/', 3) not in ('.', '..')
) not valid;
-- NOT VALID preserves historical rows for inspection. New writes are checked;
-- the worker independently validates every key, including historical rows.
