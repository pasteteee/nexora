-- Login is enabled immediately (Auth > Email > Confirm email must be OFF).
-- Auth's email_confirmed_at then means "login allowed", not proof of ownership.
alter table public.profiles add column email_verified_at timestamptz;

-- Apply BEFORE disabling Confirm email: preserve genuine historical confirmations.
update public.profiles p set email_verified_at = u.email_confirmed_at
from auth.users u where u.id = p.id and u.email_confirmed_at is not null;

-- Column-level UPDATE grants already exclude email_verified_at.
-- Only a signed, server-issued OTP session can record proof of email ownership.
create function public.confirm_profile_email()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) a
    where a->>'method' = 'magiclink'
       or (a->>'method' = 'otp' and coalesce(auth.jwt()->>'phone', '') = '')
  ) then
    raise exception 'Email OTP verification required' using errcode = '42501';
  end if;
  update public.profiles p set email_verified_at = now()
  where p.id = auth.uid() and exists (
    select 1 from auth.users u where u.id = p.id and u.email = auth.jwt()->>'email'
      and coalesce(u.phone, '') = ''
  );
  if not found then raise exception 'Email session does not match account' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.confirm_profile_email() from public, anon;
grant execute on function public.confirm_profile_email() to authenticated;

create function nexora_private.reset_email_verification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.email is distinct from new.email then
    update public.profiles set email_verified_at = null where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function nexora_private.reset_email_verification() from public, anon, authenticated;
create trigger reset_profile_email_verification after update of email on auth.users
for each row execute function nexora_private.reset_email_verification();
