import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const targetUserId = process.env.IMPASTO_USER_ID;
const sourcePath = path.resolve(
  process.env.IMPASTO_SQLITE_PATH ?? "data/impasto.sqlite",
);

if (!supabaseUrl || !secretKey || !targetUserId) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, and IMPASTO_USER_ID before migrating.",
  );
}

if (!isUuid(targetUserId)) {
  throw new Error("IMPASTO_USER_ID must be the UUID shown in Supabase Auth > Users.");
}

const db = new DatabaseSync(sourcePath, { readOnly: true });
const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  await ensureTargetUser();

  const items = readTable("items").map((row) => ({
    id: row.id,
    user_id: targetUserId,
    type: row.type,
    music_kind: row.music_kind ?? "song",
    album_title: row.album_title ?? "",
    genres: parseJson(row.genres_json, []),
    title: row.title,
    canonical_key: row.canonical_key,
    credits: parseJson(row.credits_json, []),
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  }));
  const artists = readTable("artists").map((row) => ({
    id: row.id,
    user_id: targetUserId,
    name: row.name,
    normalized_name: row.normalized_name,
    created_at: row.created_at,
  }));
  const itemArtists = readTable("item_artists");
  const logs = readTable("logs").map((row) => ({
    ...row,
    user_id: targetUserId,
  }));
  const revisions = readTable("log_revisions").map((row) => ({
    id: row.id,
    log_id: row.log_id,
    user_id: targetUserId,
    previous_item_id: row.previous_item_id,
    previous_category: row.previous_category,
    previous_title: row.previous_title,
    previous_body: row.previous_body,
    previous_rating: row.previous_rating,
    previous_artists: parseJson(row.previous_artists_json, []),
    created_at: row.created_at,
  }));
  const attachments = readTable("attachments").map((row) => ({
    id: row.id,
    user_id: targetUserId,
    item_id: row.item_id,
    log_id: row.log_id,
    kind: row.kind,
    url_or_path: row.url_or_path,
    metadata: parseJson(row.metadata_json, {}),
    created_at: row.created_at,
  }));
  const rankings = readTable("favorite_rankings").map((row) => ({
    ...row,
    user_id: targetUserId,
  }));

  await upsert("items", items, "id");
  await upsert("artists", artists, "id");
  await upsert("item_artists", itemArtists, "item_id,artist_id");
  await upsert("logs", logs, "id");
  await upsert("log_revisions", revisions, "id");
  await upsert("attachments", attachments, "id");
  await upsert(
    "favorite_rankings",
    rankings,
    "user_id,music_kind,item_id",
  );

  const total = logs.filter((row) => !row.deleted_at).length;
  console.log(`Migration complete: ${total} active logs imported for ${targetUserId}.`);
} finally {
  db.close();
}

async function ensureTargetUser() {
  const { data, error } = await supabase.auth.admin.getUserById(targetUserId);
  if (error || !data.user) {
    throw new Error(
      "Target auth user not found. Sign in to Impasto with Google once, then copy the UUID from Auth > Users.",
    );
  }
}

function readTable(table) {
  const exists = db
    .prepare("select 1 as value from sqlite_master where type = 'table' and name = ?")
    .get(table);
  return exists ? db.prepare(`select * from ${table}`).all() : [];
}

async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return;

  for (let offset = 0; offset < rows.length; offset += 250) {
    const batch = rows.slice(offset, offset + 250);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  console.log(`${table}: ${rows.length} rows`);
}

function parseJson(value, fallback) {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
