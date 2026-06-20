-- Friends (request/accept) + per-log visibility + combined home feed.

-- 1. Visibility: per-log + per-user default. Existing logs default to 'private'.
alter table public.logs
  add column if not exists visibility text not null default 'private'
    check (visibility in ('public', 'private'));

alter table public.users
  add column if not exists default_log_visibility text not null default 'private'
    check (default_log_visibility in ('public', 'private'));

-- 2. Friendships (one row per unordered pair).
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  addressee_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_key on public.friendships (
  least(requester_id, addressee_id),
  greatest(requester_id, addressee_id)
);
create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status);
create index if not exists friendships_requester_idx
  on public.friendships (requester_id, status);

alter table public.friendships enable row level security;

drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert to authenticated
  with check (requester_id = (select auth.uid()));

drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

-- 3. Visibility helpers + create/update log carry visibility, log_json exposes it.
create or replace function public.impasto_normalize_visibility(
  p_value text,
  p_user_id uuid
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_value in ('public', 'private') then p_value
    else coalesce(
      (select default_log_visibility from public.users where id = p_user_id),
      'private'
    )
  end;
$$;

create or replace function public.impasto_log_json(p_log_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', l.id,
    'itemId', l.item_id,
    'category', i.type,
    'musicKind', case when i.type = 'music' then i.music_kind else null end,
    'albumTitle', case when i.type = 'music' then i.album_title else '' end,
    'genres', case when i.type = 'music' then i.genres else '[]'::jsonb end,
    'title', l.title,
    'body', l.body,
    'rating', l.rating,
    'visibility', l.visibility,
    'artists', public.impasto_item_artists(i.id),
    'credits', case when i.type = 'music' then i.credits else '[]'::jsonb end,
    'createdAt', l.created_at,
    'updatedAt', l.updated_at
  )
  from public.logs l
  join public.items i on i.id = l.item_id
  where l.id = p_log_id
    and l.user_id = auth.uid()
    and l.deleted_at is null;
$$;

create or replace function public.impasto_create_log(p_input jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item_id uuid;
  v_log_id uuid;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  v_item_id := public.impasto_upsert_item(p_input);
  insert into public.logs (user_id, item_id, rating, title, body, visibility)
  values (
    v_user_id, v_item_id, p_input ->> 'rating',
    p_input ->> 'title', p_input ->> 'body',
    public.impasto_normalize_visibility(p_input ->> 'visibility', v_user_id)
  ) returning id into v_log_id;
  return public.impasto_log_json(v_log_id);
end;
$$;

create or replace function public.impasto_update_log(p_log_id uuid, p_input jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing record;
  v_item_id uuid;
begin
  select l.*, i.type as category
  into v_existing
  from public.logs l
  join public.items i on i.id = l.item_id
  where l.id = p_log_id
    and l.user_id = v_user_id
    and l.deleted_at is null;

  if not found then return null; end if;
  v_item_id := public.impasto_upsert_item(p_input);

  insert into public.log_revisions (
    log_id, user_id, previous_item_id, previous_category,
    previous_title, previous_body, previous_rating, previous_artists
  ) values (
    p_log_id, v_user_id, v_existing.item_id, v_existing.category,
    v_existing.title, v_existing.body, v_existing.rating,
    public.impasto_item_artists(v_existing.item_id)
  );

  update public.logs
  set item_id = v_item_id,
      rating = p_input ->> 'rating',
      title = p_input ->> 'title',
      body = p_input ->> 'body',
      visibility = public.impasto_normalize_visibility(
        p_input ->> 'visibility', v_user_id
      ),
      updated_at = now()
  where id = p_log_id and user_id = v_user_id;

  return public.impasto_log_json(p_log_id);
end;
$$;

-- 4. Profile: expose + set default visibility.
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
    'usernameChangedAt', u.username_changed_at,
    'defaultVisibility', u.default_log_visibility
  )
  from public.users u
  where u.id = auth.uid();
$$;

create or replace function public.impasto_set_default_visibility(p_visibility text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  if p_visibility not in ('public', 'private') then
    raise exception 'INVALID_VISIBILITY';
  end if;
  update public.users
  set default_log_visibility = p_visibility, updated_at = now()
  where id = v_user_id;
  return public.impasto_get_profile();
end;
$$;

-- 5. Friend management (SECURITY DEFINER: needs to read other users by handle).
create or replace function public.impasto_list_friends()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  rels as (
    select
      f.id as friendship_id,
      f.status,
      case when f.requester_id = (select uid from me)
        then f.addressee_id else f.requester_id end as other_id,
      (f.requester_id = (select uid from me)) as i_requested
    from public.friendships f, me
    where f.requester_id = me.uid or f.addressee_id = me.uid
  )
  select jsonb_build_object(
    'accepted', coalesce((
      select jsonb_agg(jsonb_build_object(
        'friendshipId', r.friendship_id, 'userId', u.id,
        'username', u.username, 'displayName', u.display_name
      ) order by lower(coalesce(u.username, u.display_name, '')))
      from rels r join public.users u on u.id = r.other_id
      where r.status = 'accepted'
    ), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object(
        'friendshipId', r.friendship_id, 'userId', u.id,
        'username', u.username, 'displayName', u.display_name
      ) order by r.friendship_id)
      from rels r join public.users u on u.id = r.other_id
      where r.status = 'pending' and not r.i_requested
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'friendshipId', r.friendship_id, 'userId', u.id,
        'username', u.username, 'displayName', u.display_name
      ) order by r.friendship_id)
      from rels r join public.users u on u.id = r.other_id
      where r.status = 'pending' and r.i_requested
    ), '[]'::jsonb)
  );
$$;

create or replace function public.impasto_send_friend_request(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target_id uuid;
  v_normalized text;
  v_existing record;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  v_normalized := lower(trim(coalesce(p_username, '')));
  if v_normalized = '' then raise exception 'USER_NOT_FOUND'; end if;

  select id into v_target_id from public.users where username = v_normalized;
  if v_target_id is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_target_id = v_user_id then raise exception 'CANNOT_FRIEND_SELF'; end if;

  select * into v_existing
  from public.friendships
  where least(requester_id, addressee_id) = least(v_user_id, v_target_id)
    and greatest(requester_id, addressee_id) = greatest(v_user_id, v_target_id);

  if found then
    if v_existing.status = 'accepted' then
      raise exception 'ALREADY_FRIENDS';
    elsif v_existing.addressee_id = v_user_id then
      -- They already requested me: accept it.
      update public.friendships
      set status = 'accepted', updated_at = now()
      where id = v_existing.id;
    else
      raise exception 'REQUEST_EXISTS';
    end if;
  else
    insert into public.friendships (requester_id, addressee_id, status)
    values (v_user_id, v_target_id, 'pending');
  end if;

  return public.impasto_list_friends();
end;
$$;

create or replace function public.impasto_respond_friend_request(
  p_friendship_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_row record;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  select * into v_row from public.friendships where id = p_friendship_id;
  if not found or v_row.addressee_id <> v_user_id or v_row.status <> 'pending' then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if p_accept then
    update public.friendships
    set status = 'accepted', updated_at = now()
    where id = p_friendship_id;
  else
    delete from public.friendships where id = p_friendship_id;
  end if;

  return public.impasto_list_friends();
end;
$$;

create or replace function public.impasto_remove_friend(p_friendship_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  delete from public.friendships
  where id = p_friendship_id
    and (requester_id = v_user_id or addressee_id = v_user_id);
  return public.impasto_list_friends();
end;
$$;

-- 6. Combined home feed (own logs + accepted friends' public logs).
create or replace function public.impasto_list_feed(
  p_scope text default 'all',
  p_search text default ''
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  params as (
    select case when p_scope in ('mine', 'friends') then p_scope else 'all' end as scope
  ),
  friend_ids as (
    select case when f.requester_id = (select uid from me)
                then f.addressee_id else f.requester_id end as friend_id
    from public.friendships f, me
    where f.status = 'accepted'
      and (f.requester_id = me.uid or f.addressee_id = me.uid)
  ),
  visible as (
    select l.*
    from public.logs l, me, params
    where l.deleted_at is null
      and (
        (params.scope in ('all', 'mine') and l.user_id = me.uid)
        or (
          params.scope in ('all', 'friends')
          and l.visibility = 'public'
          and l.user_id in (select friend_id from friend_ids)
        )
      )
  ),
  matching as (
    select v.*
    from visible v
    join public.items i on i.id = v.item_id
    where (
      nullif(trim(p_search), '') is null
      or lower(v.title) like '%' || lower(trim(p_search)) || '%'
      or lower(v.body) like '%' || lower(trim(p_search)) || '%'
      or lower(i.title) like '%' || lower(trim(p_search)) || '%'
      or lower(i.album_title) like '%' || lower(trim(p_search)) || '%'
      or lower(i.genres::text) like '%' || lower(trim(p_search)) || '%'
      or exists (
        select 1 from public.item_artists ia
        join public.artists a on a.id = ia.artist_id
        where ia.item_id = i.id
          and lower(a.name) like '%' || lower(trim(p_search)) || '%'
      )
    )
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'itemId', m.item_id,
      'category', i.type,
      'musicKind', case when i.type = 'music' then i.music_kind else null end,
      'albumTitle', case when i.type = 'music' then i.album_title else '' end,
      'genres', case when i.type = 'music' then i.genres else '[]'::jsonb end,
      'title', m.title,
      'body', m.body,
      'rating', m.rating,
      'visibility', m.visibility,
      'artists', public.impasto_item_artists(i.id),
      'credits', case when i.type = 'music' then i.credits else '[]'::jsonb end,
      'isMine', (m.user_id = (select uid from me)),
      'ownerUsername', u.username,
      'ownerDisplayName', u.display_name,
      'createdAt', m.created_at,
      'updatedAt', m.updated_at
    ) order by m.created_at desc, m.updated_at desc
  ), '[]'::jsonb)
  from matching m
  join public.items i on i.id = m.item_id
  join public.users u on u.id = m.user_id;
$$;

-- 7. Grants (mirror existing convention).
grant select, insert, update, delete on public.friendships to authenticated;

revoke all on function public.impasto_normalize_visibility(text, uuid) from public, anon;
revoke all on function public.impasto_set_default_visibility(text) from public, anon;
revoke all on function public.impasto_list_friends() from public, anon;
revoke all on function public.impasto_send_friend_request(text) from public, anon;
revoke all on function public.impasto_respond_friend_request(uuid, boolean) from public, anon;
revoke all on function public.impasto_remove_friend(uuid) from public, anon;
revoke all on function public.impasto_list_feed(text, text) from public, anon;

grant execute on function public.impasto_normalize_visibility(text, uuid) to authenticated;
grant execute on function public.impasto_set_default_visibility(text) to authenticated;
grant execute on function public.impasto_list_friends() to authenticated;
grant execute on function public.impasto_send_friend_request(text) to authenticated;
grant execute on function public.impasto_respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.impasto_remove_friend(uuid) to authenticated;
grant execute on function public.impasto_list_feed(text, text) to authenticated;
