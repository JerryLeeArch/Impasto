// Genius API: server-side credit lookup (writers / producers / performers).
// Uses a Client Access Token (read-only, no user OAuth). Maps Genius's song
// relationships onto Impasto's { role, names[] } credit model.

import { MetadataConfigError, MetadataError, type Credit } from "./types";
import { fetchProvider } from "./request";

const SEARCH_URL = "https://api.genius.com/search";
const SONG_URL = "https://api.genius.com/songs";

type GeniusArtist = { name?: string };

type GeniusSong = {
  id: number;
  title?: string;
  title_with_featured?: string;
  primary_artist?: GeniusArtist;
  writer_artists?: GeniusArtist[];
  producer_artists?: GeniusArtist[];
  featured_artists?: GeniusArtist[];
  custom_performances?: { label?: string; artists?: GeniusArtist[] }[];
};

function authHeader(): { Authorization: string } {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    throw new MetadataConfigError(
      "Genius is not configured (set GENIUS_ACCESS_TOKEN).",
    );
  }
  return { Authorization: `Bearer ${token}` };
}

export async function fetchGeniusCredits(
  title: string,
  artist: string,
): Promise<Credit[]> {
  if (!title.trim()) {
    return [];
  }

  const headers = authHeader();
  const songId = await findSongId(title, artist, headers);
  if (!songId) {
    return [];
  }

  const response = await fetchProvider("Genius", `${SONG_URL}/${songId}`, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new MetadataError("Genius song lookup failed.");
  }

  const data = (await response.json()) as { response?: { song?: GeniusSong } };
  return mapCredits(data.response?.song);
}

async function findSongId(
  title: string,
  artist: string,
  headers: { Authorization: string },
): Promise<number | null> {
  const url = new URL(SEARCH_URL);
  const searchableTitle = stripFeatureCredit(title);
  url.searchParams.set(
    "q",
    [searchableTitle, artist].filter(Boolean).join(" ").trim(),
  );

  const response = await fetchProvider("Genius", url, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new MetadataError("Genius search failed.");
  }

  const data = (await response.json()) as {
    response?: { hits?: { type?: string; result?: GeniusSong }[] };
  };
  const songs = (data.response?.hits ?? [])
    .filter((hit) => hit.type === "song" && hit.result?.id)
    .map((hit) => hit.result as GeniusSong);

  if (songs.length === 0) {
    return null;
  }

  // A Spotify title often includes a parenthesized feature credit that makes
  // Genius search less accurate. Require the confirmed primary artist to match
  // instead of silently attaching credits from Genius's unrelated top result.
  const normalizedArtist = normalizeLookupText(artist);
  const normalizedTitle = normalizeLookupText(searchableTitle);
  if (!normalizedTitle) {
    return null;
  }
  if (normalizedArtist) {
    const matched = songs.find((song) => {
      const primary = normalizeLookupText(song.primary_artist?.name ?? "");
      const songTitle = normalizeLookupText(
        stripFeatureCredit(song.title ?? song.title_with_featured ?? ""),
      );
      const artistMatches =
        primary === normalizedArtist ||
        primary.includes(normalizedArtist) ||
        normalizedArtist.includes(primary);
      const titleMatches = matchesLookupText(songTitle, normalizedTitle);
      return Boolean(primary && songTitle && artistMatches && titleMatches);
    });
    if (matched) {
      return matched.id;
    }
    return null;
  }

  const titleMatch = songs.find((song) => {
    const songTitle = normalizeLookupText(
      stripFeatureCredit(song.title ?? song.title_with_featured ?? ""),
    );
    return matchesLookupText(songTitle, normalizedTitle);
  });
  return titleMatch?.id ?? null;
}

function stripFeatureCredit(title: string): string {
  return title
    .replace(/\s*[([]\s*(?:feat(?:uring)?\.?|ft\.?)\s+[^)\]]*[)\]]/gi, "")
    .replace(/\s+[-–—]\s+(?:feat(?:uring)?\.?|ft\.?)\s+.+$/gi, "")
    .trim();
}

function normalizeLookupText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function matchesLookupText(left: string, right: string) {
  return (
    Boolean(left && right) &&
    (left === right || left.includes(right) || right.includes(left))
  );
}

function mapCredits(song: GeniusSong | undefined): Credit[] {
  if (!song) {
    return [];
  }

  const credits = new Map<string, Credit>();
  const push = (role: string, artists: GeniusArtist[] | undefined) => {
    const normalizedRole = role.replace(/\s+/g, " ").trim().slice(0, 48);
    const names = [
      ...new Set(
        (artists ?? [])
          .map((artist) => artist?.name?.trim())
          .filter((name): name is string => Boolean(name))
          .map((name) => name.slice(0, 96)),
      ),
    ].slice(0, 16);
    if (!normalizedRole || names.length === 0) {
      return;
    }

    const key = normalizedRole.toLowerCase();
    const existing = credits.get(key);
    if (!existing) {
      credits.set(key, { role: normalizedRole, names });
      return;
    }

    const seen = new Set(existing.names.map((name) => name.toLowerCase()));
    for (const name of names) {
      if (!seen.has(name.toLowerCase()) && existing.names.length < 16) {
        existing.names.push(name);
        seen.add(name.toLowerCase());
      }
    }
  };

  push("Written By", song.writer_artists);
  push("Produced By", song.producer_artists);
  push("Featuring", song.featured_artists);
  for (const performance of song.custom_performances ?? []) {
    push(performance.label?.trim() || "Performance", performance.artists);
  }

  return [...credits.values()].slice(0, 16);
}
