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
export type MusicKind = "song" | "album";

export type Credit = {
  role: string;
  names: string[];
};

export type LogInput = {
  category: Category;
  title: string;
  body: string;
  rating: Rating;
  artists: string[];
  musicKind: MusicKind;
  albumTitle: string;
  genres: string[];
  credits: Credit[];
};

export type TasteLog = {
  id: string;
  itemId: string;
  category: Category;
  musicKind: MusicKind | null;
  albumTitle: string;
  genres: string[];
  title: string;
  body: string;
  rating: Rating;
  artists: string[];
  credits: Credit[];
  createdAt: string;
  updatedAt: string;
};

export type MusicItemSummary = {
  id: string;
  title: string;
  musicKind: MusicKind;
  albumTitle: string;
  artists: string[];
};

export type FavoriteRankingEntry = MusicItemSummary & {
  rank: number;
};

type LogRow = {
  id: string;
  item_id: string;
  category: Category;
  music_kind: MusicKind;
  album_title: string | null;
  genres_json: string | null;
  credits_json: string | null;
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

type ItemRow = {
  id: string;
  title: string;
  music_kind: MusicKind;
  album_title: string | null;
  genres_json?: string | null;
  artists: string | null;
};

type RankingRow = ItemRow & {
  rank: number;
};

type TableColumnRow = {
  name: string;
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
  const musicKind =
    category === "music" ? parseMusicKind(record.musicKind) : "song";
  const albumTitle =
    category === "music" ? normalizeOptionalText(record.albumTitle, 160) : "";
  const genres = category === "music" ? parseGenres(record.genres) : [];
  const credits = category === "music" ? parseCredits(record.credits) : [];

  return {
    category,
    title,
    body,
    rating,
    artists,
    musicKind,
    albumTitle,
    genres,
    credits,
  };
}

export function listLogs({
  category = "all",
  itemId = "",
  albumTitle = "",
  search = "",
  userId = DEFAULT_USER_ID,
}: {
  category?: CategoryFilter;
  itemId?: string;
  albumTitle?: string;
  search?: string;
  userId?: string;
} = {}): TasteLog[] {
  const db = getDb();
  const where = ["l.user_id = ?", "l.deleted_at IS NULL"];
  const params: unknown[] = [userId];
  const normalizedSearch = normalizeLooseText(search).toLowerCase();
  const normalizedItemId = normalizeLooseText(itemId);
  const normalizedAlbumTitle = normalizeLooseText(albumTitle).toLowerCase();

  if (normalizedItemId) {
    where.push("l.item_id = ?");
    params.push(normalizedItemId);
  }

  if (!normalizedItemId && normalizedAlbumTitle) {
    where.push("i.type = 'music'");
    where.push("lower(i.album_title) = ?");
    params.push(normalizedAlbumTitle);
  }

  if (!normalizedItemId && !normalizedAlbumTitle && category !== "all") {
    where.push("i.type = ?");
    params.push(category);
  }

  if (!normalizedItemId && !normalizedAlbumTitle && normalizedSearch) {
    const like = `%${normalizedSearch}%`;
    where.push(`(
      lower(l.title) LIKE ?
      OR lower(l.body) LIKE ?
      OR lower(i.title) LIKE ?
      OR lower(i.album_title) LIKE ?
      OR lower(i.genres_json) LIKE ?
      OR EXISTS (
        SELECT 1
        FROM item_artists search_ia
        JOIN artists search_a ON search_a.id = search_ia.artist_id
        WHERE search_ia.item_id = i.id
          AND lower(search_a.name) LIKE ?
      )
    )`);
    params.push(like, like, like, like, like, like);
  }

  const rows = db
    .prepare(
      `
      SELECT
        l.id,
        l.item_id,
        i.type AS category,
        i.music_kind,
        i.album_title,
        i.genres_json,
        i.credits_json,
        l.title,
        l.body,
        l.rating,
        (
          SELECT group_concat(name, '|||')
          FROM (
            SELECT a.name
            FROM item_artists ia
            JOIN artists a ON a.id = ia.artist_id
            WHERE ia.item_id = i.id
            ORDER BY ia.sort_order ASC, a.name ASC
          )
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

export function listArtistSuggestions({
  search = "",
  userId = DEFAULT_USER_ID,
}: {
  search?: string;
  userId?: string;
} = {}) {
  const db = getDb();
  const normalizedSearch = normalizeLooseText(search).toLowerCase();
  const compactSearch = normalizedSearch.replace(/\s+/g, "");

  if (!normalizedSearch) {
    return [];
  }

  const rows = db
    .prepare(
      `
      SELECT name
      FROM artists
      WHERE user_id = ?
        AND (
          normalized_name LIKE ?
          OR replace(normalized_name, ' ', '') LIKE ?
        )
      ORDER BY
        CASE
          WHEN normalized_name = ? THEN 0
          WHEN normalized_name LIKE ? THEN 1
          ELSE 2
        END,
        name COLLATE NOCASE ASC
      LIMIT 8
      `,
    )
    .all(
      userId,
      `%${normalizedSearch}%`,
      `%${compactSearch}%`,
      normalizedSearch,
      `${normalizedSearch}%`,
    ) as { name: string }[];

  return rows.map((row) => row.name);
}

export function listMusicItems({
  musicKind = "song",
  search = "",
  userId = DEFAULT_USER_ID,
}: {
  musicKind?: MusicKind;
  search?: string;
  userId?: string;
} = {}): MusicItemSummary[] {
  if (musicKind === "album") {
    return listAlbumItems({ search, userId });
  }

  const db = getDb();
  const where = [
    "i.user_id = ?",
    "i.type = 'music'",
    "i.music_kind = ?",
    "i.deleted_at IS NULL",
    `EXISTS (
      SELECT 1
      FROM logs existing_l
      WHERE existing_l.item_id = i.id
        AND existing_l.user_id = i.user_id
        AND existing_l.deleted_at IS NULL
    )`,
  ];
  const params: unknown[] = [userId, musicKind];
  const normalizedSearch = normalizeLooseText(search).toLowerCase();

  if (normalizedSearch) {
    const like = `%${normalizedSearch}%`;
    where.push(`(
      lower(i.title) LIKE ?
      OR lower(i.album_title) LIKE ?
      OR EXISTS (
        SELECT 1
        FROM item_artists search_ia
        JOIN artists search_a ON search_a.id = search_ia.artist_id
        WHERE search_ia.item_id = i.id
          AND lower(search_a.name) LIKE ?
      )
    )`);
    params.push(like, like, like);
  }

  const rows = db
    .prepare(
      `
      SELECT
        i.id,
        i.title,
        i.music_kind,
        i.album_title,
        (
          SELECT group_concat(name, '|||')
          FROM (
            SELECT a.name
            FROM item_artists ia
            JOIN artists a ON a.id = ia.artist_id
            WHERE ia.item_id = i.id
            ORDER BY ia.sort_order ASC, a.name ASC
          )
        ) AS artists
      FROM items i
      WHERE ${where.join(" AND ")}
      ORDER BY i.title COLLATE NOCASE ASC
      LIMIT 200
      `,
    )
    .all(...params) as ItemRow[];

  return rows.map(mapMusicItemRow);
}

function listAlbumItems({
  search = "",
  userId = DEFAULT_USER_ID,
}: {
  search?: string;
  userId?: string;
} = {}): MusicItemSummary[] {
  const db = getDb();
  const where = [
    "i.user_id = ?",
    "i.type = 'music'",
    "i.album_title <> ''",
    "i.deleted_at IS NULL",
    `EXISTS (
      SELECT 1
      FROM logs existing_l
      WHERE existing_l.item_id = i.id
        AND existing_l.user_id = i.user_id
        AND existing_l.deleted_at IS NULL
    )`,
  ];
  const params: unknown[] = [userId];
  const normalizedSearch = normalizeLooseText(search).toLowerCase();

  if (normalizedSearch) {
    const like = `%${normalizedSearch}%`;
    where.push(`(
      lower(i.album_title) LIKE ?
      OR EXISTS (
        SELECT 1
        FROM item_artists search_ia
        JOIN artists search_a ON search_a.id = search_ia.artist_id
        WHERE search_ia.item_id = i.id
          AND lower(search_a.name) LIKE ?
      )
    )`);
    params.push(like, like);
  }

  const rows = db
    .prepare(
      `
      WITH album_items AS (
        SELECT
          i.id,
          i.album_title,
          lower(i.album_title) AS normalized_album_title,
          (
            SELECT group_concat(name, '|||')
            FROM (
              SELECT a.name
              FROM item_artists ia
              JOIN artists a ON a.id = ia.artist_id
              WHERE ia.item_id = i.id
              ORDER BY ia.sort_order ASC, a.name ASC
            )
          ) AS artists
        FROM items i
        WHERE ${where.join(" AND ")}
      )
      SELECT
        min(id) AS id,
        min(album_title) AS title,
        'album' AS music_kind,
        min(album_title) AS album_title,
        artists
      FROM album_items
      GROUP BY normalized_album_title, artists
      ORDER BY title COLLATE NOCASE ASC
      LIMIT 200
      `,
    )
    .all(...params) as ItemRow[];

  return rows.map(mapMusicItemRow);
}

export function listFavoriteRanking(
  musicKind: MusicKind,
  userId = DEFAULT_USER_ID,
): FavoriteRankingEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        i.id,
        CASE
          WHEN fr.music_kind = 'album' THEN i.album_title
          ELSE i.title
        END AS title,
        fr.music_kind AS music_kind,
        i.album_title,
        (
          SELECT group_concat(name, '|||')
          FROM (
            SELECT a.name
            FROM item_artists ia
            JOIN artists a ON a.id = ia.artist_id
            WHERE ia.item_id = i.id
            ORDER BY ia.sort_order ASC, a.name ASC
          )
        ) AS artists,
        fr.sort_order + 1 AS rank
      FROM favorite_rankings fr
      JOIN items i ON i.id = fr.item_id
      WHERE fr.user_id = ?
        AND fr.music_kind = ?
        AND i.type = 'music'
        AND (
          (fr.music_kind = 'song' AND i.music_kind = 'song')
          OR (fr.music_kind = 'album' AND i.album_title <> '')
        )
        AND i.deleted_at IS NULL
      ORDER BY
        fr.sort_order ASC,
        CASE
          WHEN fr.music_kind = 'album' THEN i.album_title
          ELSE i.title
        END COLLATE NOCASE ASC
      `,
    )
    .all(userId, musicKind) as RankingRow[];

  return rows.map((row) => ({
    ...mapMusicItemRow(row),
    rank: row.rank,
  }));
}

export function addFavoriteRankingItem(
  musicKind: MusicKind,
  itemId: string,
  userId = DEFAULT_USER_ID,
) {
  return inTransaction(() => {
    const db = getDb();
    ensureDefaultUser(db);
    const normalizedItemId = normalizeLooseText(itemId);
    const item = getMusicItemForRanking(db, normalizedItemId, musicKind, userId);

    if (!item) {
      throw new InputError("Choose a reviewed song or album.");
    }

    const maxRank = db
      .prepare(
        `
        SELECT max(sort_order) AS value
        FROM favorite_rankings
        WHERE user_id = ?
          AND music_kind = ?
        `,
      )
      .get(userId, musicKind) as { value: number | null } | undefined;
    const sortOrder = (maxRank?.value ?? -1) + 1;
    const now = nowIso();

    db.prepare(
      `
      INSERT INTO favorite_rankings (
        user_id,
        music_kind,
        item_id,
        sort_order,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, music_kind, item_id) DO NOTHING
      `,
    ).run(userId, musicKind, item.id, sortOrder, now, now);

    compactFavoriteRanking(db, musicKind, userId);
    return listFavoriteRanking(musicKind, userId);
  });
}

export function removeFavoriteRankingItem(
  musicKind: MusicKind,
  itemId: string,
  userId = DEFAULT_USER_ID,
) {
  return inTransaction(() => {
    const db = getDb();
    const normalizedItemId = normalizeLooseText(itemId);

    db.prepare(
      `
      DELETE FROM favorite_rankings
      WHERE user_id = ?
        AND music_kind = ?
        AND item_id = ?
      `,
    ).run(userId, musicKind, normalizedItemId);

    compactFavoriteRanking(db, musicKind, userId);
    return listFavoriteRanking(musicKind, userId);
  });
}

export function reorderFavoriteRanking(
  musicKind: MusicKind,
  itemIds: string[],
  userId = DEFAULT_USER_ID,
) {
  return inTransaction(() => {
    const db = getDb();
    const seen = new Set<string>();
    const orderedIds = itemIds
      .map((itemId) => normalizeLooseText(itemId))
      .filter((itemId) => {
        if (!itemId || seen.has(itemId)) {
          return false;
        }

        seen.add(itemId);
        return true;
      });
    const now = nowIso();

    for (const [index, itemId] of orderedIds.entries()) {
      db.prepare(
        `
        UPDATE favorite_rankings
        SET sort_order = ?,
            updated_at = ?
        WHERE user_id = ?
          AND music_kind = ?
          AND item_id = ?
        `,
      ).run(index, now, userId, musicKind, itemId);
    }

    compactFavoriteRanking(db, musicKind, userId);
    return listFavoriteRanking(musicKind, userId);
  });
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
      music_kind TEXT NOT NULL DEFAULT 'song' CHECK (music_kind IN ('song', 'album')),
      album_title TEXT NOT NULL DEFAULT '',
      genres_json TEXT NOT NULL DEFAULT '[]',
      title TEXT NOT NULL,
      canonical_key TEXT NOT NULL,
      credits_json TEXT NOT NULL DEFAULT '[]',
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

    CREATE TABLE IF NOT EXISTS favorite_rankings (
      user_id TEXT NOT NULL,
      music_kind TEXT NOT NULL CHECK (music_kind IN ('song', 'album')),
      item_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, music_kind, item_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS favorite_rankings_order_idx
      ON favorite_rankings(user_id, music_kind, sort_order);
  `);

  ensureItemsColumn(
    db,
    "music_kind",
    "TEXT NOT NULL DEFAULT 'song' CHECK (music_kind IN ('song', 'album'))",
  );
  ensureItemsColumn(db, "album_title", "TEXT NOT NULL DEFAULT ''");
  ensureItemsColumn(db, "genres_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureItemsColumn(db, "credits_json", "TEXT NOT NULL DEFAULT '[]'");
  migrateMusicCanonicalKeys(db);
  ensureDefaultUser(db);
}

function ensureItemsColumn(
  db: SQLiteDatabase,
  name: string,
  definition: string,
) {
  const columns = db.prepare("PRAGMA table_info(items)").all() as TableColumnRow[];

  if (columns.some((column) => column.name === name)) {
    return;
  }

  db.exec(`ALTER TABLE items ADD COLUMN ${name} ${definition};`);
}

function migrateMusicCanonicalKeys(db: SQLiteDatabase) {
  db.prepare(
    `
    UPDATE items
    SET canonical_key = 'music:song:' || substr(canonical_key, 7)
    WHERE type = 'music'
      AND canonical_key LIKE 'music:%'
      AND canonical_key NOT LIKE 'music:song:%'
      AND canonical_key NOT LIKE 'music:album:%'
    `,
  ).run();
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
  const genresJson = JSON.stringify(input.genres);
  const creditsJson = JSON.stringify(input.credits);
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
    db.prepare(
      `
      UPDATE items
      SET title = ?,
          music_kind = ?,
          album_title = ?,
          genres_json = ?,
          credits_json = ?,
          updated_at = ?
      WHERE id = ?
        AND user_id = ?
      `,
    ).run(
      input.title,
      input.musicKind,
      input.albumTitle,
      genresJson,
      creditsJson,
      nowIso(),
      existing.id,
      userId,
    );

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
      music_kind,
      album_title,
      genres_json,
      title,
      canonical_key,
      credits_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    itemId,
    userId,
    input.category,
    input.musicKind,
    input.albumTitle,
    genresJson,
    input.title,
    canonicalKey,
    creditsJson,
    now,
    now,
  );

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
        i.music_kind,
        i.album_title,
        i.genres_json,
        i.credits_json,
        l.title,
        l.body,
        l.rating,
        (
          SELECT group_concat(name, '|||')
          FROM (
            SELECT a.name
            FROM item_artists ia
            JOIN artists a ON a.id = ia.artist_id
            WHERE ia.item_id = i.id
            ORDER BY ia.sort_order ASC, a.name ASC
          )
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
          SELECT group_concat(name, '|||')
          FROM (
            SELECT a.name
            FROM item_artists ia
            JOIN artists a ON a.id = ia.artist_id
            WHERE ia.item_id = i.id
            ORDER BY ia.sort_order ASC, a.name ASC
          )
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

function getMusicItemForRanking(
  db: SQLiteDatabase,
  itemId: string,
  musicKind: MusicKind,
  userId: string,
) {
  return db
    .prepare(
      `
      SELECT id
      FROM items
      WHERE id = ?
        AND user_id = ?
        AND type = 'music'
        AND (
          (? = 'song' AND music_kind = 'song')
          OR (? = 'album' AND album_title <> '')
        )
        AND deleted_at IS NULL
      `,
    )
    .get(itemId, userId, musicKind, musicKind) as { id: string } | undefined;
}

function compactFavoriteRanking(
  db: SQLiteDatabase,
  musicKind: MusicKind,
  userId: string,
) {
  const rows = db
    .prepare(
      `
      SELECT item_id
      FROM favorite_rankings
      WHERE user_id = ?
        AND music_kind = ?
      ORDER BY sort_order ASC, updated_at ASC
      `,
    )
    .all(userId, musicKind) as { item_id: string }[];
  const now = nowIso();

  for (const [index, row] of rows.entries()) {
    db.prepare(
      `
      UPDATE favorite_rankings
      SET sort_order = ?,
          updated_at = ?
      WHERE user_id = ?
        AND music_kind = ?
        AND item_id = ?
      `,
    ).run(index, now, userId, musicKind, row.item_id);
  }
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
    musicKind:
      row.category === "music" ? parseStoredMusicKind(row.music_kind) : null,
    albumTitle: row.category === "music" ? normalizeLooseText(row.album_title) : "",
    genres: row.category === "music" ? parseStoredGenres(row.genres_json) : [],
    title: row.title,
    body: row.body,
    rating: row.rating,
    artists: splitArtistList(row.artists),
    credits: row.category === "music" ? parseStoredCredits(row.credits_json) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMusicItemRow(row: ItemRow): MusicItemSummary {
  return {
    id: row.id,
    title: row.title,
    musicKind: parseStoredMusicKind(row.music_kind),
    albumTitle: normalizeLooseText(row.album_title),
    artists: splitArtistList(row.artists),
  };
}

function buildCanonicalKey(input: LogInput) {
  const normalizedTitle = normalizeLooseText(input.title).toLowerCase();
  const normalizedArtists = input.artists
    .map((artist) => normalizeLooseText(artist).toLowerCase())
    .sort()
    .join(",");

  if (input.category === "music") {
    return [
      input.category,
      input.musicKind,
      normalizedTitle,
      normalizedArtists,
    ].join(":");
  }

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

export function parseMusicKind(value: unknown): MusicKind {
  if (value === "song" || value === "album") {
    return value;
  }

  return "song";
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

function parseGenres(value: unknown) {
  const source =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value
        : [];
  const seen = new Set<string>();
  const genres: string[] = [];

  for (const item of source) {
    if (typeof item !== "string") {
      continue;
    }

    const genre = normalizeLooseText(item).slice(0, 48);
    const key = genre.toLowerCase();

    if (!genre || seen.has(key)) {
      continue;
    }

    genres.push(genre);
    seen.add(key);
  }

  return genres.slice(0, 12);
}

function parseCredits(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const credits: Credit[] = [];

  for (const item of source) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    const role = normalizeLooseText(record.role).slice(0, 48);
    const names = parseCreditNames(record.names);

    if (!role || names.length === 0) {
      continue;
    }

    credits.push({ role, names });
  }

  return credits.slice(0, 16);
}

function parseCreditNames(value: unknown) {
  const source =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value)
        ? value
        : [];
  const seen = new Set<string>();
  const names: string[] = [];

  for (const item of source) {
    if (typeof item !== "string") {
      continue;
    }

    const name = normalizeLooseText(item).slice(0, 96);
    const key = name.toLowerCase();

    if (!name || seen.has(key)) {
      continue;
    }

    names.push(name);
    seen.add(key);
  }

  return names.slice(0, 16);
}

function parseStoredMusicKind(value: unknown): MusicKind {
  return value === "album" ? "album" : "song";
}

function parseStoredCredits(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    return parseCredits(JSON.parse(value));
  } catch {
    return [];
  }
}

function parseStoredGenres(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    return parseGenres(JSON.parse(value));
  } catch {
    return [];
  }
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

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeLooseText(value).slice(0, maxLength);
}

function normalizeLooseText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function nowIso() {
  return new Date().toISOString();
}
