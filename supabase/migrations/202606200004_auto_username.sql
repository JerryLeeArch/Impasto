-- Auto-assign a unique username to new (and existing username-less) users.
-- Leaves username_changed_at NULL so the user can still pick their own handle
-- once for free (the 14-day cooldown only starts after a manual change).

create or replace function public.impasto_generate_username(p_seed text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_base text;
  v_candidate text;
  v_suffix integer := 0;
begin
  v_base := lower(coalesce(p_seed, ''));
  v_base := split_part(v_base, '@', 1);                 -- email local part
  v_base := regexp_replace(v_base, '[^a-z0-9._]', '', 'g');
  v_base := regexp_replace(v_base, '\.+', '.', 'g');     -- collapse dots
  v_base := regexp_replace(v_base, '^[._]+', '', 'g');   -- trim leading . / _
  v_base := regexp_replace(v_base, '[._]+$', '', 'g');   -- trim trailing . / _
  v_base := left(v_base, 20);

  if length(v_base) < 3 then
    v_base := 'user';
  end if;

  v_candidate := v_base;
  while exists (select 1 from public.users where username = v_candidate) loop
    v_suffix := v_suffix + 1;
    v_candidate := left(v_base, 24) || v_suffix::text;
  end loop;

  return v_candidate;
end;
$$;

revoke all on function public.impasto_generate_username(text) from public, anon;

-- New users: handle_new_user now seeds username on first insert.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, display_name, email, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'Me'),
    new.email,
    public.impasto_generate_username(
      coalesce(new.email, new.raw_user_meta_data ->> 'full_name', 'user')
    )
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      updated_at = now();
  return new;
end;
$$;

-- Backfill existing users without a username (per-row so each sees prior picks).
do $$
declare
  r record;
begin
  for r in
    select id, email, display_name from public.users where username is null
  loop
    update public.users
    set username = public.impasto_generate_username(
      coalesce(r.email, r.display_name, 'user')
    )
    where id = r.id;
  end loop;
end $$;
