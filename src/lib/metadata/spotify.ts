// Spotify Web API access via the Client Credentials flow (app-only, no user
// login / Premium needed). Used to fetch album art and the track id that the
// in-browser embed player needs.

import {
  MetadataConfigError,
  MetadataError,
  type AlbumCover,
  type ArtistProfile,
  type TrackMatch,
} from "./types";
import { fetchProvider } from "./request";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SEARCH_URL = "https://api.spotify.com/v1/search";

type CachedToken = { token: string; expiresAt: number };

// Module-level cache: a client-credentials token is valid ~1h and shared across
// all users, so we reuse it until shortly before expiry.
let cachedToken: CachedToken | null = null;
let pendingToken: Promise<string> | null = null;

async function getAppToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new MetadataConfigError(
      "Spotify is not configured (set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET).",
    );
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  if (!pendingToken) {
    pendingToken = requestAppToken(clientId, clientSecret).finally(() => {
      pendingToken = null;
    });
  }

  return pendingToken;
}

async function requestAppToken(clientId: string, clientSecret: string) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64",
  );
  const response = await fetchProvider("Spotify", TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    cachedToken = null;
    throw new MetadataError("Could not authenticate with Spotify.");
  }

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new MetadataError("Spotify did not return an access token.");
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

type SpotifyImage = { url: string };

type SpotifyTrack = {
  id: string;
  name: string;
  explicit?: boolean;
  artists?: { name: string }[];
  album?: {
    name?: string;
    release_date?: string;
    images?: SpotifyImage[];
  };
};

export async function searchSpotifyTracks(
  title: string,
  artist: string,
  limit = 6,
): Promise<TrackMatch[]> {
  if (!title.trim()) {
    return [];
  }

  let token = await getAppToken();
  // Field filters give markedly better matches than a bare keyword query.
  const query = artist.trim()
    ? `track:${title} artist:${artist}`
    : title;

  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 10)));

  let response = await fetchSpotifySearch(url, token);
  if (response.status === 401) {
    cachedToken = null;
    token = await getAppToken();
    response = await fetchSpotifySearch(url, token);
  }

  if (!response.ok) {
    throw new MetadataError("Spotify search failed.");
  }

  const data = (await response.json()) as { tracks?: { items?: SpotifyTrack[] } };
  const items = data.tracks?.items ?? [];

  return items
    .filter((track) => /^[A-Za-z0-9]{22}$/.test(track?.id ?? ""))
    .map((track) => ({
      spotifyTrackId: track.id,
      title: track.name,
      artists: (track.artists ?? []).map((a) => a.name).filter(Boolean),
      albumTitle: track.album?.name ?? "",
      coverUrl: pickCoverImage(track.album?.images),
      releaseDate: track.album?.release_date ?? null,
      explicit: Boolean(track.explicit),
    }));
}

type SpotifyArtist = {
  id: string;
  name: string;
  images?: SpotifyImage[];
};

// Looks up the artist photo shown above an artist's logs. Returns null when
// Spotify has no match for the name. Genres, follower counts and popularity are
// deliberately absent: Spotify stopped returning them to client-credentials
// apps in Nov 2024, so there is nothing to read.
export async function searchSpotifyArtist(
  name: string,
): Promise<ArtistProfile | null> {
  const trimmed = name.trim();
  if (!trimmed) {
    return null;
  }

  let token = await getAppToken();

  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", `artist:${trimmed}`);
  url.searchParams.set("type", "artist");
  url.searchParams.set("limit", "5");

  let response = await fetchSpotifySearch(url, token);
  if (response.status === 401) {
    cachedToken = null;
    token = await getAppToken();
    response = await fetchSpotifySearch(url, token);
  }

  if (!response.ok) {
    throw new MetadataError("Spotify artist search failed.");
  }

  const data = (await response.json()) as {
    artists?: { items?: SpotifyArtist[] };
  };
  const items = (data.artists?.items ?? []).filter((artist) =>
    /^[A-Za-z0-9]{22}$/.test(artist?.id ?? ""),
  );

  if (items.length === 0) {
    return null;
  }

  // Spotify ranks by popularity, which can put a bigger unrelated artist above
  // an exact name match, so prefer the exact match when there is one.
  const normalized = normalizeName(trimmed);
  const match =
    items.find((artist) => normalizeName(artist.name) === normalized) ??
    items[0];

  return {
    spotifyArtistId: match.id,
    name: match.name,
    imageUrl: pickCoverImage(match.images),
  };
}

type SpotifyAlbum = {
  id: string;
  name: string;
  images?: SpotifyImage[];
  artists?: { name: string }[];
};

// Looks up the artwork shown above an album's logs. The artist filter is not
// optional in practice: a bare title like "Dark" returns an unrelated album.
export async function searchSpotifyAlbum(
  albumTitle: string,
  artist: string,
): Promise<AlbumCover | null> {
  const trimmedTitle = albumTitle.trim();
  const trimmedArtist = artist.trim();

  if (!trimmedTitle) {
    return null;
  }

  let token = await getAppToken();

  const url = new URL(SEARCH_URL);
  url.searchParams.set(
    "q",
    trimmedArtist
      ? `album:${trimmedTitle} artist:${trimmedArtist}`
      : `album:${trimmedTitle}`,
  );
  url.searchParams.set("type", "album");
  url.searchParams.set("limit", "5");

  let response = await fetchSpotifySearch(url, token);
  if (response.status === 401) {
    cachedToken = null;
    token = await getAppToken();
    response = await fetchSpotifySearch(url, token);
  }

  if (!response.ok) {
    throw new MetadataError("Spotify album search failed.");
  }

  const data = (await response.json()) as {
    albums?: { items?: SpotifyAlbum[] };
  };
  const items = (data.albums?.items ?? []).filter((album) =>
    /^[A-Za-z0-9]{22}$/.test(album?.id ?? ""),
  );

  if (items.length === 0) {
    return null;
  }

  // Spotify ranks by popularity, so a deluxe or compilation edition can outrank
  // the album itself ("H.E.R. Volume 1" above "H.E.R."). Prefer an exact title.
  const normalized = normalizeName(trimmedTitle);
  const match =
    items.find((album) => normalizeName(album.name) === normalized) ?? items[0];

  return {
    spotifyAlbumId: match.id,
    name: match.name,
    imageUrl: pickCoverImage(match.images),
    artists: (match.artists ?? []).map((a) => a.name).filter(Boolean),
  };
}

function normalizeName(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function fetchSpotifySearch(url: URL, token: string) {
  return fetchProvider("Spotify", url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

// Spotify returns images largest-first (typically 640 / 300 / 64). Prefer the
// ~300px middle size for crisp thumbnails without overfetching.
function pickCoverImage(images: SpotifyImage[] | undefined): string | null {
  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }
  const candidate = images[1]?.url ?? images[0]?.url;
  if (!candidate) {
    return null;
  }
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && url.hostname === "i.scdn.co"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
