-- Cursor-paginated home feed. Keep impasto_list_feed in place for backwards
-- compatibility while the application moves to fixed-size pages.

create index if not exists logs_feed_user_created_idx
  on public.logs (user_id, created_at desc, id desc)
  where deleted_at is null;

create index if not exists logs_feed_public_user_created_idx
  on public.logs (user_id, created_at desc, id desc)
  where deleted_at is null and visibility = 'public';

create or replace function public.impasto_list_feed_page(
  p_scope text default 'all',
  p_search text default '',
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as uid
  ),
  params as (
    select
      case when p_scope in ('mine', 'friends') then p_scope else 'all' end as scope,
      greatest(1, least(coalesce(p_limit, 20), 50)) as page_limit
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
      and (
        (p_cursor_created_at is null and p_cursor_id is null)
        or (
          p_cursor_created_at is not null
          and p_cursor_id is not null
          and (l.created_at, l.id) < (p_cursor_created_at, p_cursor_id)
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
  ),
  page_rows as (
    select m.*
    from matching m, params
    order by m.created_at desc, m.id desc
    limit (select page_limit + 1 from params)
  ),
  returned_rows as (
    select p.*
    from page_rows p, params
    order by p.created_at desc, p.id desc
    limit (select page_limit from params)
  ),
  page_meta as (
    select
      count(*) > (select page_limit from params) as has_more,
      (
        select jsonb_build_object(
          'createdAt', r.created_at,
          'id', r.id
        )
        from returned_rows r
        order by r.created_at asc, r.id asc
        limit 1
      ) as last_cursor
    from page_rows
  )
  select jsonb_build_object(
    'logs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'itemId', r.item_id,
          'category', i.type,
          'musicKind', case when i.type = 'music' then i.music_kind else null end,
          'albumTitle', case when i.type = 'music' then i.album_title else '' end,
          'genres', case when i.type = 'music' then i.genres else '[]'::jsonb end,
          'title', r.title,
          'body', r.body,
          'rating', r.rating,
          'visibility', r.visibility,
          'artists', public.impasto_item_artists(i.id),
          'credits', case when i.type = 'music' then i.credits else '[]'::jsonb end,
          'coverUrl', i.cover_url,
          'spotifyTrackId',
            case when i.type = 'music' then i.spotify_track_id else null end,
          'isMine', (r.user_id = (select uid from me)),
          'ownerUsername', u.username,
          'ownerDisplayName', u.display_name,
          'createdAt', r.created_at,
          'updatedAt', r.updated_at
        ) order by r.created_at desc, r.id desc
      )
      from returned_rows r
      join public.items i on i.id = r.item_id
      join public.users u on u.id = r.user_id
    ), '[]'::jsonb),
    'hasMore', (select has_more from page_meta),
    'nextCursor', case
      when (select has_more from page_meta)
      then (select last_cursor from page_meta)
      else null
    end
  );
$$;

revoke all on function public.impasto_list_feed_page(
  text, text, timestamptz, uuid, integer
) from public, anon;

grant execute on function public.impasto_list_feed_page(
  text, text, timestamptz, uuid, integer
) to authenticated;
