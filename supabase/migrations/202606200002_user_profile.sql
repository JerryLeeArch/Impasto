-- User profile: public username (handle) with a 14-day change cooldown.

alter table public.users
  add column if not exists username text,
  add column if not exists username_changed_at timestamptz;

-- Usernames are stored lowercase-normalized, so a plain unique constraint gives
-- case-insensitive uniqueness. Multiple NULLs are allowed (users without a handle yet).
create unique index if not exists users_username_key on public.users (username);

create or replace function public.impasto_get_profile()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'username', u.username,
    'displayName', u.display_name,
    'email', u.email,
    'usernameChangedAt', u.username_changed_at
  )
  from public.users u
  where u.id = auth.uid();
$$;

create or replace function public.impasto_set_username(p_username text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized text;
  v_last_changed timestamptz;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;

  v_normalized := lower(trim(coalesce(p_username, '')));

  -- Allowed: a-z, 0-9, '.', '_'; length 3-30; no leading/trailing '.'; no '..'.
  if v_normalized !~ '^[a-z0-9._]{3,30}$'
     or v_normalized ~ '\.\.'
     or v_normalized ~ '^\.'
     or v_normalized ~ '\.$'
  then
    raise exception 'INVALID_USERNAME';
  end if;

  select username_changed_at into v_last_changed
  from public.users
  where id = v_user_id;

  if v_last_changed is not null and v_last_changed > now() - interval '14 days' then
    raise exception 'USERNAME_COOLDOWN';
  end if;

  update public.users
  set username = v_normalized,
      username_changed_at = now(),
      updated_at = now()
  where id = v_user_id;

  return public.impasto_get_profile();
exception
  when unique_violation then
    raise exception 'USERNAME_TAKEN';
end;
$$;

revoke all on function public.impasto_get_profile() from public, anon;
revoke all on function public.impasto_set_username(text) from public, anon;
grant execute on function public.impasto_get_profile() to authenticated;
grant execute on function public.impasto_set_username(text) to authenticated;
