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

revoke all on function public.impasto_list_feed(text, text) from public, anon;
grant execute on function public.impasto_list_feed(text, text) to authenticated;
