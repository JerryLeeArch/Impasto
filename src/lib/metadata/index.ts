// Provider-specific metadata lookup. Spotify selection happens first in the UI;
// Genius is then queried with the confirmed title and primary artist.

import { fetchGeniusCredits } from "./genius";
import {
  searchSpotifyAlbum,
  searchSpotifyArtist,
  searchSpotifyTracks,
} from "./spotify";
import {
  MetadataConfigError,
  MetadataError,
  type AlbumCover,
  type ArtistProfile,
  type Credit,
  type MetadataProvider,
  type TrackMatch,
  type TrackMetadata,
} from "./types";

export type {
  AlbumCover,
  ArtistProfile,
  Credit,
  TrackMatch,
  TrackMetadata,
} from "./types";

const cacheTtlMs = 5 * 60_000;
const cacheLimit = 250;
const lookupCache = new Map<
  string,
  { expiresAt: number; value: TrackMetadata }
>();

// Artwork lookups change far less often than track lookups, so they share a
// longer-lived cache.
const artworkCacheTtlMs = 30 * 60_000;
const artworkCache = new Map<
  string,
  { expiresAt: number; value: ArtistProfile | AlbumCover | null }
>();

// Both lookups below resolve to null rather than throwing when Spotify is
// unconfigured or unreachable, so the view still renders its logs without art.
async function lookupArtwork<T extends ArtistProfile | AlbumCover>(
  cacheKey: string,
  search: () => Promise<T | null>,
): Promise<T | null> {
  const cached = artworkCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T | null;
  }
  if (cached) {
    artworkCache.delete(cacheKey);
  }

  let value: T | null = null;
  try {
    value = await search();
  } catch (error) {
    if (!(error instanceof MetadataConfigError || error instanceof MetadataError)) {
      throw error;
    }
    return null;
  }

  if (artworkCache.size >= cacheLimit) {
    const oldestKey = artworkCache.keys().next().value;
    if (oldestKey) {
      artworkCache.delete(oldestKey);
    }
  }
  artworkCache.set(cacheKey, {
    expiresAt: Date.now() + artworkCacheTtlMs,
    value,
  });
  return value;
}

export function lookupArtistProfile(name: string) {
  return lookupArtwork(`artist:${normalizeKey(name)}`, () =>
    searchSpotifyArtist(name),
  );
}

export function lookupAlbumCover(albumTitle: string, artist: string) {
  return lookupArtwork(
    `album:${normalizeKey(albumTitle)}:${normalizeKey(artist)}`,
    () => searchSpotifyAlbum(albumTitle, artist),
  );
}

function normalizeKey(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export async function lookupTrackMetadata(
  title: string,
  artist: string,
  provider: MetadataProvider,
): Promise<TrackMetadata> {
  const cacheKey = createCacheKey(provider, title, artist);
  const cached = lookupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  if (cached) {
    lookupCache.delete(cacheKey);
  }

  try {
    if (provider === "spotify") {
      const matches: TrackMatch[] = await searchSpotifyTracks(title, artist);
      return cacheResult(cacheKey, { matches, credits: [], warnings: [] });
    }

    const credits: Credit[] = await fetchGeniusCredits(title, artist);
    return cacheResult(cacheKey, { matches: [], credits, warnings: [] });
  } catch (error) {
    if (!(error instanceof MetadataConfigError || error instanceof MetadataError)) {
      throw error;
    }
    const providerName = provider === "spotify" ? "Spotify" : "Genius";
    return {
      matches: [],
      credits: [],
      warnings: [describeError(providerName, error)],
    };
  }
}

function createCacheKey(
  provider: MetadataProvider,
  title: string,
  artist: string,
) {
  const normalize = (value: string) =>
    value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return `${provider}:${normalize(title)}:${normalize(artist)}`;
}

function cacheResult(key: string, value: TrackMetadata) {
  if (lookupCache.size >= cacheLimit) {
    const oldestKey = lookupCache.keys().next().value;
    if (oldestKey) {
      lookupCache.delete(oldestKey);
    }
  }
  lookupCache.set(key, { expiresAt: Date.now() + cacheTtlMs, value });
  return value;
}

function describeError(provider: string, reason: unknown): string {
  if (reason instanceof MetadataConfigError) {
    return reason.message;
  }
  if (reason instanceof Error) {
    return `${provider}: ${reason.message}`;
  }
  return `${provider}: lookup failed.`;
}
