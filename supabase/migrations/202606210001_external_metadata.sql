-- External music metadata: Spotify (album art + track id for the embed player)
-- and Genius (credits). Adds two nullable columns to public.items and threads
-- them through the read/write functions. Music-only in practice; null elsewhere.

alter table public.items
  add column if not exists cover_url text,
  add column if not exists spotify_track_id text;

-- Upsert: persist the new fields. Preserve existing values when the input omits
-- them (e.g. editing a log without re-fetching metadata).
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
      canonical_key, credits, cover_url, spotify_track_id
    ) values (
      v_user_id,
      p_input ->> 'category',
      coalesce(p_input ->> 'music_kind', 'song'),
      coalesce(p_input ->> 'album_title', ''),
      coalesce(p_input -> 'genres', '[]'::jsonb),
      p_input ->> 'title',
      p_input ->> 'canonical_key',
      coalesce(p_input -> 'credits', '[]'::jsonb),
      nullif(p_input ->> 'cover_url', ''),
      nullif(p_input ->> 'spotify_track_id', '')
    ) returning id into v_item_id;
  else
    update public.items
    set title = p_input ->> 'title',
        music_kind = coalesce(p_input ->> 'music_kind', 'song'),
        album_title = coalesce(p_input ->> 'album_title', ''),
        genres = coalesce(p_input -> 'genres', '[]'::jsonb),
        credits = coalesce(p_input -> 'credits', '[]'::jsonb),
        cover_url = coalesce(nullif(p_input ->> 'cover_url', ''), cover_url),
        spotify_track_id =
          coalesce(nullif(p_input ->> 'spotify_track_id', ''), spotify_track_id),
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

-- log_json: expose coverUrl + spotifyTrackId (latest version was in _003_friends).
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
    'coverUrl', i.cover_url,
    'spotifyTrackId', case when i.type = 'music' then i.spotify_track_id else null end,
    'createdAt', l.created_at,
    'updatedAt', l.updated_at
  )
  from public.logs l
  join public.items i on i.id = l.item_id
  where l.id = p_log_id
    and l.user_id = auth.uid()
    and l.deleted_at is null;
$$;

-- list_feed: same new fields in the inline JSON (latest version was in _003).
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
      'coverUrl', i.cover_url,
      'spotifyTrackId',
        case when i.type = 'music' then i.spotify_track_id else null end,
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

-- list_music_items: carry coverUrl into the ranking candidate picker.
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
      i.cover_url as cover_url,
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
    ) id, title, music_kind, album_title, artists, cover_url
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
    'artists', artists,
    'coverUrl', cover_url
  ) order by lower(title)), '[]'::jsonb)
  from (select * from deduplicated order by lower(title) limit 200) limited;
$$;

-- list_favorite_ranking: carry coverUrl into the ranking list.
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
    'coverUrl', i.cover_url,
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
