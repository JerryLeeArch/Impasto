-- Make Spotify metadata removable, validate it at the database boundary, and
-- stop returning unused cover fields from ranking candidate RPCs.

update public.items
set cover_url = null,
    spotify_track_id = null
where type <> 'music'
   or music_kind <> 'song'
   or (cover_url is not null and cover_url !~ '^https://i\.scdn\.co/')
   or (spotify_track_id is not null and spotify_track_id !~ '^[A-Za-z0-9]{22}$');

alter table public.items
  drop constraint if exists items_spotify_cover_url_check,
  drop constraint if exists items_spotify_track_id_check;

alter table public.items
  add constraint items_spotify_cover_url_check check (
    cover_url is null
    or (
      type = 'music'
      and music_kind = 'song'
      and length(cover_url) <= 2048
      and cover_url ~ '^https://i\.scdn\.co/'
    )
  ),
  add constraint items_spotify_track_id_check check (
    spotify_track_id is null
    or (
      type = 'music'
      and music_kind = 'song'
      and spotify_track_id ~ '^[A-Za-z0-9]{22}$'
    )
  );

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
        cover_url = nullif(p_input ->> 'cover_url', ''),
        spotify_track_id = nullif(p_input ->> 'spotify_track_id', ''),
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
