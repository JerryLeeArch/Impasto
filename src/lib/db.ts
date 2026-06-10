import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

type SQLiteModule = typeof import("node:sqlite");
type SQLiteDatabase = import("node:sqlite").DatabaseSync;

const nodeRequire = createRequire(path.join(process.cwd(), "package.json"));
const { DatabaseSync } = nodeRequire("node:sqlite") as SQLiteModule;

export const DEFAULT_USER_ID = "local-user";

export type Category = "music" | "image" | "other";
export type CategoryFilter = Category | "all";
export type Rating = "like" | "neutral" | "dislike";

export type LogInput = {
  category: Category;
  title: string;
  body: string;
  rating: Rating;
  artists: string[];
};

export type TasteLog = {
  id: string;
  itemId: string;
  category: Category;
  title: string;
  body: string;
  rating: Rating;
  artists: string[];
  createdAt: string;
  updatedAt: string;
};

type LogRow = {
  id: string;
  item_id: string;
  category: Category;
  title: string;
  body: string;
  rating: Rating;
  artists: string | null;
  created_at: string;
  updated_at: string;
};

type ExistingLogRow = {
  id: string;
  item_id: string;
  title: string;
  body: string;
  rating: Rating;
  category: Category;
  artists: string | null;
};

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

let database: SQLiteDatabase | null = null;

export function getDb() {
  if (database) {
    return database;
  }

  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });

  database = new DatabaseSync(path.join(dataDir, "impasto.sqlite"));
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  migrate(database);

  return database;
}

export function parseLogInput(payload: unknown): LogInput {
  if (!payload || typeof payload !== "object") {
    throw new InputError("Invalid log payload.");
  }

  const record = payload as Record<string, unknown>;
  const category = parseCategory(record.category);
  const rating = parseRating(record.rating);
  const title = normalizeRequiredText(record.title, "Title", 160);
  const body = normalizeRequiredMultilineText(record.body, "Notes", 5000);
  const artists = category === "music" ? parseArtists(record.artists) : [];

  return {
    category,
    title,
    body,
    rating,
    artists,
  };
}

export function listLogs({
  category = "all",
  itemId = "",
  search = "",
  userId = DEFAULT_USER_ID,
}: {
  category?: CategoryFilter;
  itemId?: string;
  search?: string;
  userId?: string;
} = {}): TasteLog[] {
  const db = getDb();
  const where = ["l.user_id = ?", "l.deleted_at IS NULL"];
  const params: unknown[] = [userId];
  const normalizedSearch = normalizeLooseText(search).toLowerCase();
  const normalizedItemId = normalizeLooseText(itemId);

  if (normalizedItemId) {
    where.push("l.item_id = ?");
    params.push(normalizedItemId);
  }

  if (!normalizedItemId && category !== "all") {
    where.push("i.type = ?");
    params.push(category);
  }

  if (!normalizedItemId && normalizedSearch) {
    const like = `%${normalizedSearch}%`;
    where.push(`(
      lower(l.title) LIKE ?
      OR lower(l.body) LIKE ?
      OR lower(i.title) LIKE ?
      OR EXISTS (
        SELECT 1
        FROM item_artists search_ia
        JOIN artists search_a ON search_a.id = search_ia.artist_id
        WHERE search_ia.item_id = i.id
          AND lower(search_a.name) LIKE ?
      )
    )`);
    params.push(like, like, like, like);
  }

  const rows = db
    .prepare(
      `
      SELECT
        l.id,
        l.item_id,
        i.type AS category,
        l.title,
        l.body,
        l.rating,
        (
          SELECT group_concat(a.name, '|||')
          FROM item_artists ia
          JOIN artists a ON a.id = ia.artist_id
          WHERE ia.item_id = i.id
        ) AS artists,
        l.created_at,
        l.updated_at
      FROM logs l
      JOIN items i ON i.id = l.item_id
      WHERE ${where.join(" AND ")}
      ORDER BY l.created_at DESC, l.updated_at DESC
      `,
    )
    .all(...params) as LogRow[];

  return rows.map(mapLogRow);
}

export function createLog(input: LogInput, userId = DEFAULT_USER_ID) {
  return inTransaction(() => {
    const db = getDb();
    ensureDefaultUser(db);

    const itemId = getOrCreateItem(db, input, userId);
    const id = randomUUID();
    const now = nowIso();

    db.prepare(
      `
      INSERT INTO logs (
        id,
        user_id,
        item_id,
        rating,
        title,
        body,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(id, userId, itemId, input.rating, input.title, input.body, now, now);

    return getLogById(id, userId);
  });
}

export function updateLog(id: string, input: LogInput, userId = DEFAULT_USER_ID) {
  return inTransaction(() => {
    const db = getDb();
    const existing = getExistingLogForUpdate(db, id, userId);

    if (!existing) {
      return null;
    }

    const now = nowIso();
    const itemId = getOrCreateItem(db, input, userId);

    db.prepare(
      `
      INSERT INTO log_revisions (
        id,
        log_id,
        user_id,
        previous_item_id,
        previous_category,
        previous_title,
        previous_body,
        previous_rating,
        previous_artists_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      randomUUID(),
      existing.id,
      userId,
      existing.item_id,
      existing.category,
      existing.title,
      existing.body,
      existing.rating,
      JSON.stringify(splitArtistList(existing.artists)),
      now,
    );

    db.prepare(
      `
      UPDATE logs
      SET item_id = ?,
          rating = ?,
          title = ?,
          body = ?,
          updated_at = ?
      WHERE id = ?
        AND user_id = ?
        AND deleted_at IS NULL
      `,
    ).run(itemId, input.rating, input.title, input.body, now, id, userId);

    return getLogById(id, userId);
  });
}

export function softDeleteLog(id: string, userId = DEFAULT_USER_ID) {
  const db = getDb();
  const now = nowIso();
  const result = db
    .prepare(
      `
      UPDATE logs
      SET deleted_at = ?,
          updated_at = ?
      WHERE id = ?
        AND user_id = ?
        AND deleted_at IS NULL
      `,
    )
    .run(now, now, id, userId);

  return result.changes > 0;
}

function migrate(db: SQLiteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('music', 'image', 'other')),
      title TEXT NOT NULL,
      canonical_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS items_user_canonical_idx
      ON items(user_id, canonical_key);

    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS artists_user_normalized_idx
      ON artists(user_id, normalized_name);

    CREATE TABLE IF NOT EXISTS item_artists (
      item_id TEXT NOT NULL,
      artist_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (item_id, artist_id),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      rating TEXT NOT NULL CHECK (rating IN ('like', 'neutral', 'dislike')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE INDEX IF NOT EXISTS logs_user_created_idx
      ON logs(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS logs_item_idx
      ON logs(item_id);

    CREATE TABLE IF NOT EXISTS log_revisions (
      id TEXT PRIMARY KEY,
      log_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      previous_item_id TEXT NOT NULL,
      previous_category TEXT NOT NULL,
      previous_title TEXT NOT NULL,
      previous_body TEXT NOT NULL,
      previous_rating TEXT NOT NULL,
      previous_artists_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (log_id) REFERENCES logs(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      item_id TEXT,
      log_id TEXT,
      kind TEXT NOT NULL,
      url_or_path TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      FOREIGN KEY (log_id) REFERENCES logs(id)
    );
  `);

  ensureDefaultUser(db);
}

function ensureDefaultUser(db: SQLiteDatabase) {
  const now = nowIso();

  db.prepare(
    `
    INSERT INTO users (id, display_name, email, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO NOTHING
    `,
  ).run(DEFAULT_USER_ID, "Me", now, now);
}

function getOrCreateItem(db: SQLiteDatabase, input: LogInput, userId: string) {
  const canonicalKey = buildCanonicalKey(input);
  const existing = db
    .prepare(
      `
      SELECT id
      FROM items
      WHERE user_id = ?
        AND canonical_key = ?
      `,
    )
    .get(userId, canonicalKey) as { id: string } | undefined;

  if (existing) {
    return existing.id;
  }

  const itemId = randomUUID();
  const now = nowIso();

  db.prepare(
    `
    INSERT INTO items (
      id,
      user_id,
      type,
      title,
      canonical_key,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(itemId, userId, input.category, input.title, canonicalKey, now, now);

  if (input.category === "music") {
    setItemArtists(db, itemId, input.artists, userId);
  }

  return itemId;
}

function setItemArtists(
  db: SQLiteDatabase,
  itemId: string,
  artistNames: string[],
  userId: string,
) {
  for (const [index, artistName] of artistNames.entries()) {
    const artistId = getOrCreateArtist(db, artistName, userId);

    db.prepare(
      `
      INSERT OR IGNORE INTO item_artists (item_id, artist_id, sort_order)
      VALUES (?, ?, ?)
      `,
    ).run(itemId, artistId, index);
  }
}

function getOrCreateArtist(db: SQLiteDatabase, name: string, userId: string) {
  const normalizedName = normalizeLooseText(name).toLowerCase();
  const existing = db
    .prepare(
      `
      SELECT id
      FROM artists
      WHERE user_id = ?
        AND normalized_name = ?
      `,
    )
    .get(userId, normalizedName) as { id: string } | undefined;

  if (existing) {
    return existing.id;
  }

  const id = randomUUID();

  db.prepare(
    `
    INSERT INTO artists (id, user_id, name, normalized_name, created_at)
    VALUES (?, ?, ?, ?, ?)
    `,
  ).run(id, userId, name, normalizedName, nowIso());

  return id;
}

function getLogById(id: string, userId: string) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT
        l.id,
        l.item_id,
        i.type AS category,
        l.title,
        l.body,
        l.rating,
        (
          SELECT group_concat(a.name, '|||')
          FROM item_artists ia
          JOIN artists a ON a.id = ia.artist_id
          WHERE ia.item_id = i.id
        ) AS artists,
        l.created_at,
        l.updated_at
      FROM logs l
      JOIN items i ON i.id = l.item_id
      WHERE l.id = ?
        AND l.user_id = ?
        AND l.deleted_at IS NULL
      `,
    )
    .get(id, userId) as LogRow | undefined;

  return row ? mapLogRow(row) : null;
}

function getExistingLogForUpdate(
  db: SQLiteDatabase,
  id: string,
  userId: string,
) {
  return db
    .prepare(
      `
      SELECT
        l.id,
        l.item_id,
        l.title,
        l.body,
        l.rating,
        i.type AS category,
        (
          SELECT group_concat(a.name, '|||')
          FROM item_artists ia
          JOIN artists a ON a.id = ia.artist_id
          WHERE ia.item_id = i.id
        ) AS artists
      FROM logs l
      JOIN items i ON i.id = l.item_id
      WHERE l.id = ?
        AND l.user_id = ?
        AND l.deleted_at IS NULL
      `,
    )
    .get(id, userId) as ExistingLogRow | undefined;
}

function inTransaction<T>(callback: () => T) {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE;");

  try {
    const result = callback();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

function mapLogRow(row: LogRow): TasteLog {
  return {
    id: row.id,
    itemId: row.item_id,
    category: row.category,
    title: row.title,
    body: row.body,
    rating: row.rating,
    artists: splitArtistList(row.artists),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildCanonicalKey(input: LogInput) {
  const normalizedTitle = normalizeLooseText(input.title).toLowerCase();
  const normalizedArtists = input.artists
    .map((artist) => normalizeLooseText(artist).toLowerCase())
    .sort()
    .join(",");

  return [input.category, normalizedTitle, normalizedArtists].join(":");
}

function parseCategory(value: unknown): Category {
  if (value === "music" || value === "image" || value === "other") {
    return value;
  }

  throw new InputError("Choose a valid category.");
}

function parseRating(value: unknown): Rating {
  if (value === "like" || value === "neutral" || value === "dislike") {
    return value;
  }

  throw new InputError("Choose a valid rating.");
}

function parseArtists(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const artists: string[] = [];

  for (const item of source) {
    if (typeof item !== "string") {
      continue;
    }

    const name = normalizeLooseText(item).slice(0, 80);
    const key = name.toLowerCase();

    if (!name || seen.has(key)) {
      continue;
    }

    artists.push(name);
    seen.add(key);
  }

  return artists.slice(0, 12);
}

function splitArtistList(value: string | null) {
  return value ? value.split("|||").filter(Boolean) : [];
}

function normalizeRequiredText(
  value: unknown,
  label: string,
  maxLength: number,
) {
  if (typeof value !== "string") {
    throw new InputError(`${label} is required.`);
  }

  const normalized = normalizeLooseText(value);

  if (!normalized) {
    throw new InputError(`${label} is required.`);
  }

  return normalized.slice(0, maxLength);
}

function normalizeRequiredMultilineText(
  value: unknown,
  label: string,
  maxLength: number,
) {
  if (typeof value !== "string") {
    throw new InputError(`${label} is required.`);
  }

  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  if (!normalized) {
    throw new InputError(`${label} is required.`);
  }

  return normalized.slice(0, maxLength);
}

function normalizeLooseText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function nowIso() {
  return new Date().toISOString();
}
