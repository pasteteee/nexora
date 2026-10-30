-- Reserve source quotas inside the database so simultaneous browser uploads
-- cannot bypass the client checks. Keep file transfer direct to Storage: a
-- 25 MiB file exceeds the Vercel Function request-body limit.
create or replace function nexora_private.enforce_source_quota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  source_count bigint;
  total_size bigint;
begin
  if new.size <= 0 or new.size > 26214400 then
    raise exception 'Файл должен быть непустым и не больше 25 МиБ' using errcode = '23514';
  end if;
  -- All reservations for one workspace serialize on its existing parent row.
  perform 1 from public.workspaces where id = new.workspace_id for update;
  select count(*), coalesce(sum(size), 0) into source_count, total_size
    from public.sources where workspace_id = new.workspace_id and id <> new.id;
  if source_count >= 100 then
    raise exception 'В тетради уже 100 материалов' using errcode = '23514';
  end if;
  if total_size + new.size > 524288000 then
    raise exception 'Превышен объём тетради 500 МиБ' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function nexora_private.enforce_source_quota() from public, anon, authenticated;
create trigger sources_enforce_quota before insert or update of size, workspace_id
  on public.sources for each row execute function nexora_private.enforce_source_quota();
