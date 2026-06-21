import type { SupabaseClient } from "@supabase/supabase-js";

export type Category = "music" | "image" | "other";
export type CategoryFilter = Category | "all";
export type Rating = "like" | "neutral" | "dislike";
export type MusicKind = "song" | "album";
export type Visibility = "public" | "private";
export type FeedScope = "all" | "mine" | "friends";

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
  visibility: Visibility;
  coverUrl: string;
  spotifyTrackId: string;
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
  visibility: Visibility;
  coverUrl: string | null;
  spotifyTrackId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeedLog = TasteLog & {
  isMine: boolean;
  ownerUsername: string | null;
  ownerDisplayName: string | null;
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

export type Profile = {
  username: string | null;
  displayName: string | null;
  email: string | null;
  usernameChangedAt: string | null;
  defaultVisibility: Visibility;
};

export type FriendSummary = {
  friendshipId: string;
  userId: string;
  username: string | null;
  displayName: string | null;
};

export type FriendList = {
  accepted: FriendSummary[];
  incoming: FriendSummary[];
  outgoing: FriendSummary[];
};

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

export class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseError";
  }
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
  const visibility = parseVisibility(record.visibility);
  const supportsTrackMetadata = category === "music" && musicKind === "song";
  const coverUrl = supportsTrackMetadata
    ? normalizeSpotifyCoverUrl(record.coverUrl)
    : "";
  const spotifyTrackId = supportsTrackMetadata
    ? normalizeSpotifyTrackId(record.spotifyTrackId)
    : "";

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
    visibility,
    coverUrl,
    spotifyTrackId,
  };
}

export function parseVisibility(value: unknown): Visibility {
  return value === "public" ? "public" : "private";
}

export async function listLogs(
  supabase: SupabaseClient,
  {
    category = "all",
    itemId = "",
    albumTitle = "",
    search = "",
  }: {
    category?: CategoryFilter;
    itemId?: string;
    albumTitle?: string;
    search?: string;
  } = {},
) {
  return callRpc<TasteLog[]>(supabase, "impasto_list_logs", {
    p_category: category,
    p_item_id: normalizeOptionalUuid(itemId),
    p_album_title: normalizeLooseText(albumTitle),
    p_search: normalizeLooseText(search),
  });
}

export async function createLog(supabase: SupabaseClient, input: LogInput) {
  return callRpc<TasteLog>(supabase, "impasto_create_log", {
    p_input: toDatabaseInput(input),
  });
}

export async function updateLog(
  supabase: SupabaseClient,
  id: string,
  input: LogInput,
) {
  return callRpc<TasteLog | null>(supabase, "impasto_update_log", {
    p_log_id: requireUuid(id),
    p_input: toDatabaseInput(input),
  });
}

export async function softDeleteLog(supabase: SupabaseClient, id: string) {
  return callRpc<boolean>(supabase, "impasto_delete_log", {
    p_log_id: requireUuid(id),
  });
}

export async function listArtistSuggestions(
  supabase: SupabaseClient,
  { search = "" }: { search?: string } = {},
) {
  const normalizedSearch = normalizeLooseText(search);

  if (!normalizedSearch) {
    return [];
  }

  return callRpc<string[]>(supabase, "impasto_list_artist_suggestions", {
    p_search: normalizedSearch,
  });
}

export async function listMusicItems(
  supabase: SupabaseClient,
  {
    musicKind = "song",
    search = "",
  }: { musicKind?: MusicKind; search?: string } = {},
) {
  return callRpc<MusicItemSummary[]>(supabase, "impasto_list_music_items", {
    p_music_kind: musicKind,
    p_search: normalizeLooseText(search),
  });
}

export async function listFavoriteRanking(
  supabase: SupabaseClient,
  musicKind: MusicKind,
) {
  return callRpc<FavoriteRankingEntry[]>(
    supabase,
    "impasto_list_favorite_ranking",
    { p_music_kind: musicKind },
  );
}

export async function addFavoriteRankingItem(
  supabase: SupabaseClient,
  musicKind: MusicKind,
  itemId: string,
) {
  return callRpc<FavoriteRankingEntry[]>(
    supabase,
    "impasto_add_favorite_ranking_item",
    { p_music_kind: musicKind, p_item_id: requireUuid(itemId) },
  );
}

export async function removeFavoriteRankingItem(
  supabase: SupabaseClient,
  musicKind: MusicKind,
  itemId: string,
) {
  return callRpc<FavoriteRankingEntry[]>(
    supabase,
    "impasto_remove_favorite_ranking_item",
    { p_music_kind: musicKind, p_item_id: requireUuid(itemId) },
  );
}

export async function reorderFavoriteRanking(
  supabase: SupabaseClient,
  musicKind: MusicKind,
  itemIds: string[],
) {
  const seen = new Set<string>();
  const orderedIds = itemIds
    .map((itemId) => requireUuid(itemId))
    .filter((itemId) => {
      if (seen.has(itemId)) {
        return false;
      }

      seen.add(itemId);
      return true;
    });

  return callRpc<FavoriteRankingEntry[]>(
    supabase,
    "impasto_reorder_favorite_ranking",
    { p_music_kind: musicKind, p_item_ids: orderedIds },
  );
}

export async function getProfile(supabase: SupabaseClient) {
  return callRpc<Profile>(supabase, "impasto_get_profile", {});
}

export async function setUsername(supabase: SupabaseClient, username: string) {
  return callRpc<Profile>(supabase, "impasto_set_username", {
    p_username: typeof username === "string" ? username : "",
  });
}

export async function setDefaultVisibility(
  supabase: SupabaseClient,
  visibility: Visibility,
) {
  return callRpc<Profile>(supabase, "impasto_set_default_visibility", {
    p_visibility: parseVisibility(visibility),
  });
}

export async function listFeed(
  supabase: SupabaseClient,
  { scope = "all", search = "" }: { scope?: FeedScope; search?: string } = {},
) {
  return callRpc<FeedLog[]>(supabase, "impasto_list_feed", {
    p_scope: scope,
    p_search: normalizeLooseText(search),
  });
}

export async function listFriends(supabase: SupabaseClient) {
  return callRpc<FriendList>(supabase, "impasto_list_friends", {});
}

export async function sendFriendRequest(
  supabase: SupabaseClient,
  username: string,
) {
  return callRpc<FriendList>(supabase, "impasto_send_friend_request", {
    p_username: typeof username === "string" ? username : "",
  });
}

export async function respondFriendRequest(
  supabase: SupabaseClient,
  friendshipId: string,
  accept: boolean,
) {
  return callRpc<FriendList>(supabase, "impasto_respond_friend_request", {
    p_friendship_id: requireUuid(friendshipId),
    p_accept: accept,
  });
}

export async function removeFriend(
  supabase: SupabaseClient,
  friendshipId: string,
) {
  return callRpc<FriendList>(supabase, "impasto_remove_friend", {
    p_friendship_id: requireUuid(friendshipId),
  });
}

export function parseMusicKind(value: unknown): MusicKind {
  return value === "album" ? "album" : "song";
}

async function callRpc<T>(
  supabase: SupabaseClient,
  name: string,
  params: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc(name, params);

  if (error) {
    if (error.message.includes("Choose a reviewed song or album")) {
      throw new InputError("Choose a reviewed song or album.");
    }

    if (error.message.includes("INVALID_USERNAME")) {
      throw new InputError(
        "Usernames use 3–30 lowercase letters, numbers, periods, or underscores (no leading, trailing, or repeated periods).",
      );
    }

    if (error.message.includes("USERNAME_TAKEN")) {
      throw new InputError("That username is already taken.");
    }

    if (error.message.includes("USERNAME_COOLDOWN")) {
      throw new InputError("You can only change your username once every 14 days.");
    }

    if (error.message.includes("USER_NOT_FOUND")) {
      throw new InputError("No user found with that username.");
    }

    if (error.message.includes("CANNOT_FRIEND_SELF")) {
      throw new InputError("You can't send a friend request to yourself.");
    }

    if (error.message.includes("ALREADY_FRIENDS")) {
      throw new InputError("You're already friends.");
    }

    if (error.message.includes("REQUEST_EXISTS")) {
      throw new InputError("A friend request is already pending.");
    }

    if (error.message.includes("REQUEST_NOT_FOUND")) {
      throw new InputError("That friend request is no longer available.");
    }

    throw new DatabaseError(error.message);
  }

  return data as T;
}

function toDatabaseInput(input: LogInput) {
  return {
    category: input.category,
    title: input.title,
    body: input.body,
    rating: input.rating,
    artists: input.artists,
    music_kind: input.musicKind,
    album_title: input.albumTitle,
    genres: input.genres,
    credits: input.credits,
    visibility: input.visibility,
    cover_url: input.coverUrl,
    spotify_track_id: input.spotifyTrackId,
    canonical_key: buildCanonicalKey(input),
  };
}

function buildCanonicalKey(input: LogInput) {
  const normalizedTitle = normalizeLooseText(input.title).toLowerCase();
  const normalizedArtists = input.artists
    .map((artist) => normalizeLooseText(artist).toLowerCase())
    .sort()
    .join(",");

  return input.category === "music"
    ? [input.category, input.musicKind, normalizedTitle, normalizedArtists].join(
        ":",
      )
    : [input.category, normalizedTitle, normalizedArtists].join(":");
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
    if (typeof item !== "string") continue;
    const name = normalizeLooseText(item).slice(0, 80);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
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
  return uniqueStrings(source, 48, 12);
}

function parseCredits(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const credits: Credit[] = [];

  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const role = normalizeLooseText(record.role).slice(0, 48);
    const namesSource =
      typeof record.names === "string"
        ? record.names.split(",")
        : Array.isArray(record.names)
          ? record.names
          : [];
    const names = uniqueStrings(namesSource, 96, 16);
    if (role && names.length > 0) credits.push({ role, names });
  }

  return credits.slice(0, 32);
}

function uniqueStrings(source: unknown[], maxLength: number, limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of source) {
    if (typeof item !== "string") continue;
    const value = normalizeLooseText(item).slice(0, maxLength);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    result.push(value);
    seen.add(key);
  }

  return result.slice(0, limit);
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
  if (!normalized) throw new InputError(`${label} is required.`);
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

  if (!normalized) throw new InputError(`${label} is required.`);
  return normalized.slice(0, maxLength);
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? normalizeLooseText(value).slice(0, maxLength)
    : "";
}

// Spotify track ids are 22-character base62 strings. Reject anything else so a
// malformed value never reaches the embed iframe.
function normalizeSpotifyTrackId(value: unknown) {
  const normalized = normalizeLooseText(value);
  return /^[A-Za-z0-9]{22}$/.test(normalized) ? normalized : "";
}

// Covers come from Spotify's image CDN. Restricting the host prevents a crafted
// log from turning friends' feed views into requests to an arbitrary tracker.
function normalizeSpotifyCoverUrl(value: unknown) {
  const normalized = normalizeLooseText(value).slice(0, 2048);
  if (!normalized) {
    return "";
  }
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" && url.hostname === "i.scdn.co"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function normalizeLooseText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptionalUuid(value: string) {
  const normalized = normalizeLooseText(value);
  return normalized ? requireUuid(normalized) : null;
}

function requireUuid(value: string) {
  const normalized = normalizeLooseText(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new InputError("Invalid resource identifier.");
  }
  return normalized;
}
