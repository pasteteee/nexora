-- Аудит безопасности (#44): не более 20 приглашений в тетрадь за час.
-- Без лимита владелец мог бы рассылать письма Nexora на произвольные адреса.
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
  -- Защита от рассылки писем на чужие адреса через приглашения (аудит #44)
  if (select count(*) from public.workspace_invitations i
      where i.workspace_id = p_workspace_id and i.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'invitation_rate_limit' using errcode = '54000';
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
