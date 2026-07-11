-- Impasto is music-only now: drop the image and other logging categories.
-- Deletes all non-music data and restricts item types to music going forward.
-- Album covers on music logs (items.cover_url) are unrelated and untouched.

-- Revisions can point at a non-music item from a log that later changed
-- category, and previous_item_id has no cascade, so clear them before the
-- items.
delete from public.log_revisions
where previous_item_id in (
  select id from public.items where type <> 'music'
);

-- logs.item_id has no cascade either. Revisions and attachments of these logs
-- cascade with the delete.
delete from public.logs
where item_id in (
  select id from public.items where type <> 'music'
);

-- item_artists, attachments, and favorite_rankings cascade from items.
delete from public.items where type <> 'music';

alter table public.items drop constraint items_type_check;
alter table public.items add constraint items_type_check
  check (type = 'music');
