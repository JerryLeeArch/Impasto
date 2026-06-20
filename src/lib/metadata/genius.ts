// Genius API: server-side credit lookup (writers / producers / performers).
// Uses a Client Access Token (read-only, no user OAuth). Maps Genius's song
// relationships onto Impasto's { role, names[] } credit model.

import { MetadataConfigError, MetadataError, type Credit } from "./types";

const SEARCH_URL = "https://api.genius.com/search";
const SONG_URL = "https://api.genius.com/songs";

type GeniusArtist = { name?: string };

type GeniusSong = {
  id: number;
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

  const response = await fetch(`${SONG_URL}/${songId}`, {
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
  url.searchParams.set("q", [title, artist].filter(Boolean).join(" ").trim());

  const response = await fetch(url, { headers, cache: "no-store" });
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

  // Prefer a hit whose primary artist matches the supplied artist; otherwise
  // fall back to Genius's own top result.
  const normalizedArtist = artist.trim().toLowerCase();
  if (normalizedArtist) {
    const matched = songs.find((song) => {
      const primary = (song.primary_artist?.name ?? "").toLowerCase();
      return primary.includes(normalizedArtist) || normalizedArtist.includes(primary);
    });
    if (matched) {
      return matched.id;
    }
  }

  return songs[0].id;
}

function mapCredits(song: GeniusSong | undefined): Credit[] {
  if (!song) {
    return [];
  }

  const credits: Credit[] = [];
  const push = (role: string, artists: GeniusArtist[] | undefined) => {
    const names = (artists ?? [])
      .map((artist) => artist?.name?.trim())
      .filter((name): name is string => Boolean(name));
    if (names.length > 0) {
      credits.push({ role, names });
    }
  };

  push("Written By", song.writer_artists);
  push("Produced By", song.producer_artists);
  push("Featuring", song.featured_artists);
  for (const performance of song.custom_performances ?? []) {
    push(performance.label?.trim() || "Performance", performance.artists);
  }

  return credits;
}
