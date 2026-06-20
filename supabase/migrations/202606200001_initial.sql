create extension if not exists pgcrypto;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Me',
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('music', 'image', 'other')),
  music_kind text not null default 'song' check (music_kind in ('song', 'album')),
  album_title text not null default '',
  genres jsonb not null default '[]'::jsonb check (jsonb_typeof(genres) = 'array'),
  title text not null,
  canonical_key text not null,
  credits jsonb not null default '[]'::jsonb check (jsonb_typeof(credits) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, canonical_key)
);

create table public.artists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create table public.item_artists (
  item_id uuid not null references public.items(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (item_id, artist_id)
);

create table public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  item_id uuid not null references public.items(id),
  rating text not null check (rating in ('like', 'neutral', 'dislike')),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.log_revisions (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.logs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  previous_item_id uuid not null references public.items(id),
  previous_category text not null,
  previous_title text not null,
  previous_body text not null,
  previous_rating text not null,
  previous_artists jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  log_id uuid references public.logs(id) on delete cascade,
  kind text not null,
  url_or_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.favorite_rankings (
  user_id uuid not null references public.users(id) on delete cascade,
  music_kind text not null check (music_kind in ('song', 'album')),
  item_id uuid not null references public.items(id) on delete cascade,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, music_kind, item_id)
);

create index logs_user_created_idx on public.logs(user_id, created_at desc);
create index logs_item_idx on public.logs(item_id);
create index item_artists_artist_idx on public.item_artists(artist_id);
create index favorite_rankings_order_idx
  on public.favorite_rankings(user_id, music_kind, sort_order);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.users (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'Me'),
    new.email
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute procedure public.handle_new_user();

insert into public.users (id, display_name, email, created_at, updated_at)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', email, 'Me'),
  email,
  created_at,
  updated_at
from auth.users
on conflict (id) do nothing;

alter table public.users enable row level security;
alter table public.items enable row level security;
alter table public.artists enable row level security;
alter table public.item_artists enable row level security;
alter table public.logs enable row level security;
alter table public.log_revisions enable row level security;
alter table public.attachments enable row level security;
alter table public.favorite_rankings enable row level security;

create policy users_own_rows on public.users
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy items_own_rows on public.items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy artists_own_rows on public.artists
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy item_artists_own_rows on public.item_artists
  for all to authenticated
  using (exists (
    select 1 from public.items i
    where i.id = item_id and i.user_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from public.items i
      where i.id = item_id and i.user_id = (select auth.uid())
    ) and exists (
      select 1 from public.artists a
      where a.id = artist_id and a.user_id = (select auth.uid())
    )
  );
create policy logs_own_rows on public.logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy log_revisions_own_rows on public.log_revisions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy attachments_own_rows on public.attachments
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy favorite_rankings_own_rows on public.favorite_rankings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.impasto_item_artists(p_item_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(a.name order by ia.sort_order, a.name), '[]'::jsonb)
  from public.item_artists ia
  join public.artists a on a.id = ia.artist_id
  where ia.item_id = p_item_id;
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

create or replace function public.impasto_list_logs(
  p_category text default 'all',
  p_item_id uuid default null,
  p_album_title text default '',
  p_search text default ''
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with matching as (
    select l.id, l.created_at, l.updated_at
    from public.logs l
    join public.items i on i.id = l.item_id
    where l.user_id = auth.uid()
      and l.deleted_at is null
      and (p_item_id is null or l.item_id = p_item_id)
      and (
        p_item_id is not null
        or nullif(trim(p_album_title), '') is null
        or (i.type = 'music' and lower(i.album_title) = lower(trim(p_album_title)))
      )
      and (
        p_item_id is not null
        or nullif(trim(p_album_title), '') is not null
        or p_category = 'all'
        or i.type = p_category
      )
      and (
        p_item_id is not null
        or nullif(trim(p_album_title), '') is not null
        or nullif(trim(p_search), '') is null
        or lower(l.title) like '%' || lower(trim(p_search)) || '%'
        or lower(l.body) like '%' || lower(trim(p_search)) || '%'
        or lower(i.title) like '%' || lower(trim(p_search)) || '%'
        or lower(i.album_title) like '%' || lower(trim(p_search)) || '%'
        or lower(i.genres::text) like '%' || lower(trim(p_search)) || '%'
        or exists (
          select 1
          from public.item_artists ia
          join public.artists a on a.id = ia.artist_id
          where ia.item_id = i.id
            and lower(a.name) like '%' || lower(trim(p_search)) || '%'
        )
      )
  )
  select coalesce(
    jsonb_agg(public.impasto_log_json(id) order by created_at desc, updated_at desc),
    '[]'::jsonb
  )
  from matching;
$$;

create or replace function public.impasto_upsert_item(p_input jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item_id uuid;
  v_artist_name text;
  v_artist_id uuid;
  v_index integer := 0;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;

  select id into v_item_id
  from public.items
  where user_id = v_user_id
    and canonical_key = p_input ->> 'canonical_key';

  if v_item_id is null then
    insert into public.items (
      user_id, type, music_kind, album_title, genres, title,
      canonical_key, credits
    ) values (
      v_user_id,
      p_input ->> 'category',
      coalesce(p_input ->> 'music_kind', 'song'),
      coalesce(p_input ->> 'album_title', ''),
      coalesce(p_input -> 'genres', '[]'::jsonb),
      p_input ->> 'title',
      p_input ->> 'canonical_key',
      coalesce(p_input -> 'credits', '[]'::jsonb)
    ) returning id into v_item_id;
  else
    update public.items
    set title = p_input ->> 'title',
        music_kind = coalesce(p_input ->> 'music_kind', 'song'),
        album_title = coalesce(p_input ->> 'album_title', ''),
        genres = coalesce(p_input -> 'genres', '[]'::jsonb),
        credits = coalesce(p_input -> 'credits', '[]'::jsonb),
        updated_at = now()
    where id = v_item_id and user_id = v_user_id;
  end if;

  if p_input ->> 'category' = 'music' then
    delete from public.item_artists where item_id = v_item_id;

    for v_artist_name in
      select value from jsonb_array_elements_text(
        coalesce(p_input -> 'artists', '[]'::jsonb)
      )
    loop
      insert into public.artists (user_id, name, normalized_name)
      values (
        v_user_id,
        v_artist_name,
        lower(regexp_replace(trim(v_artist_name), '\s+', ' ', 'g'))
      )
      on conflict (user_id, normalized_name) do update set name = excluded.name
      returning id into v_artist_id;

      insert into public.item_artists (item_id, artist_id, sort_order)
      values (v_item_id, v_artist_id, v_index)
      on conflict (item_id, artist_id) do update set sort_order = excluded.sort_order;
      v_index := v_index + 1;
    end loop;
  end if;

  return v_item_id;
end;
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
  insert into public.logs (user_id, item_id, rating, title, body)
  values (
    v_user_id, v_item_id, p_input ->> 'rating',
    p_input ->> 'title', p_input ->> 'body'
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
      updated_at = now()
  where id = p_log_id and user_id = v_user_id;

  return public.impasto_log_json(p_log_id);
end;
$$;

create or replace function public.impasto_delete_log(p_log_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update public.logs
  set deleted_at = now(), updated_at = now()
  where id = p_log_id
    and user_id = auth.uid()
    and deleted_at is null;
  return found;
end;
$$;

create or replace function public.impasto_list_artist_suggestions(p_search text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(name order by priority, name), '[]'::jsonb)
  from (
    select name,
      case
        when normalized_name = lower(trim(p_search)) then 0
        when normalized_name like lower(trim(p_search)) || '%' then 1
        else 2
      end as priority
    from public.artists
    where user_id = auth.uid()
      and (
        normalized_name like '%' || lower(trim(p_search)) || '%'
        or replace(normalized_name, ' ', '') like
          '%' || replace(lower(trim(p_search)), ' ', '') || '%'
      )
    order by priority, name
    limit 8
  ) suggestions;
$$;

create or replace function public.impasto_list_music_items(
  p_music_kind text default 'song',
  p_search text default ''
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with candidates as (
    select
      i.id,
      case when p_music_kind = 'album' then i.album_title else i.title end as title,
      p_music_kind as music_kind,
      i.album_title,
      public.impasto_item_artists(i.id) as artists,
      lower(i.album_title) as normalized_album_title
    from public.items i
    where i.user_id = auth.uid()
      and i.type = 'music'
      and i.deleted_at is null
      and (
        (p_music_kind = 'song' and i.music_kind = 'song')
        or (p_music_kind = 'album' and i.album_title <> '')
      )
      and exists (
        select 1 from public.logs l
        where l.item_id = i.id and l.user_id = auth.uid() and l.deleted_at is null
      )
      and (
        nullif(trim(p_search), '') is null
        or lower(i.title) like '%' || lower(trim(p_search)) || '%'
        or lower(i.album_title) like '%' || lower(trim(p_search)) || '%'
        or exists (
          select 1 from public.item_artists ia
          join public.artists a on a.id = ia.artist_id
          where ia.item_id = i.id
            and lower(a.name) like '%' || lower(trim(p_search)) || '%'
        )
      )
  ), deduplicated as (
    select distinct on (
      case when p_music_kind = 'album' then normalized_album_title else id::text end,
      case when p_music_kind = 'album' then artists::text else id::text end
    ) id, title, music_kind, album_title, artists
    from candidates
    order by
      case when p_music_kind = 'album' then normalized_album_title else id::text end,
      case when p_music_kind = 'album' then artists::text else id::text end,
      id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'title', title,
    'musicKind', music_kind,
    'albumTitle', album_title,
    'artists', artists
  ) order by lower(title)), '[]'::jsonb)
  from (select * from deduplicated order by lower(title) limit 200) limited;
$$;

create or replace function public.impasto_list_favorite_ranking(p_music_kind text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'title', case when fr.music_kind = 'album' then i.album_title else i.title end,
    'musicKind', fr.music_kind,
    'albumTitle', i.album_title,
    'artists', public.impasto_item_artists(i.id),
    'rank', fr.sort_order + 1
  ) order by fr.sort_order, lower(
    case when fr.music_kind = 'album' then i.album_title else i.title end
  )), '[]'::jsonb)
  from public.favorite_rankings fr
  join public.items i on i.id = fr.item_id
  where fr.user_id = auth.uid()
    and fr.music_kind = p_music_kind
    and i.type = 'music'
    and i.deleted_at is null
    and (
      (fr.music_kind = 'song' and i.music_kind = 'song')
      or (fr.music_kind = 'album' and i.album_title <> '')
    );
$$;

create or replace function public.impasto_compact_favorite_ranking(p_music_kind text)
returns void
language sql
set search_path = public
as $$
  with ordered as (
    select item_id, row_number() over (order by sort_order, updated_at, item_id) - 1 as new_order
    from public.favorite_rankings
    where user_id = auth.uid() and music_kind = p_music_kind
  )
  update public.favorite_rankings fr
  set sort_order = ordered.new_order, updated_at = now()
  from ordered
  where fr.user_id = auth.uid()
    and fr.music_kind = p_music_kind
    and fr.item_id = ordered.item_id;
$$;

create or replace function public.impasto_add_favorite_ranking_item(
  p_music_kind text,
  p_item_id uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_sort_order integer;
begin
  if not exists (
    select 1 from public.items i
    where i.id = p_item_id
      and i.user_id = auth.uid()
      and i.type = 'music'
      and i.deleted_at is null
      and (
        (p_music_kind = 'song' and i.music_kind = 'song')
        or (p_music_kind = 'album' and i.album_title <> '')
      )
  ) then
    raise exception 'Choose a reviewed song or album.';
  end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order
  from public.favorite_rankings
  where user_id = auth.uid() and music_kind = p_music_kind;

  insert into public.favorite_rankings (user_id, music_kind, item_id, sort_order)
  values (auth.uid(), p_music_kind, p_item_id, v_sort_order)
  on conflict (user_id, music_kind, item_id) do nothing;

  perform public.impasto_compact_favorite_ranking(p_music_kind);
  return public.impasto_list_favorite_ranking(p_music_kind);
end;
$$;

create or replace function public.impasto_remove_favorite_ranking_item(
  p_music_kind text,
  p_item_id uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
begin
  delete from public.favorite_rankings
  where user_id = auth.uid()
    and music_kind = p_music_kind
    and item_id = p_item_id;
  perform public.impasto_compact_favorite_ranking(p_music_kind);
  return public.impasto_list_favorite_ranking(p_music_kind);
end;
$$;

create or replace function public.impasto_reorder_favorite_ranking(
  p_music_kind text,
  p_item_ids uuid[]
)
returns jsonb
language plpgsql
set search_path = public
as $$
begin
  update public.favorite_rankings fr
  set sort_order = ordered.ordinality - 1, updated_at = now()
  from unnest(p_item_ids) with ordinality as ordered(item_id, ordinality)
  where fr.user_id = auth.uid()
    and fr.music_kind = p_music_kind
    and fr.item_id = ordered.item_id;
  perform public.impasto_compact_favorite_ranking(p_music_kind);
  return public.impasto_list_favorite_ranking(p_music_kind);
end;
$$;

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public, anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.impasto_item_artists(uuid) to authenticated;
grant execute on function public.impasto_log_json(uuid) to authenticated;
grant execute on function public.impasto_upsert_item(jsonb) to authenticated;
grant execute on function public.impasto_compact_favorite_ranking(text) to authenticated;
grant execute on function public.impasto_list_logs(text, uuid, text, text) to authenticated;
grant execute on function public.impasto_create_log(jsonb) to authenticated;
grant execute on function public.impasto_update_log(uuid, jsonb) to authenticated;
grant execute on function public.impasto_delete_log(uuid) to authenticated;
grant execute on function public.impasto_list_artist_suggestions(text) to authenticated;
grant execute on function public.impasto_list_music_items(text, text) to authenticated;
grant execute on function public.impasto_list_favorite_ranking(text) to authenticated;
grant execute on function public.impasto_add_favorite_ranking_item(text, uuid) to authenticated;
grant execute on function public.impasto_remove_favorite_ranking_item(text, uuid) to authenticated;
grant execute on function public.impasto_reorder_favorite_ranking(text, uuid[]) to authenticated;

comment on schema public is 'Impasto application schema. All user data is protected by RLS.';
