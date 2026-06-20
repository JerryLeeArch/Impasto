// Combined metadata lookup: Spotify (matches: art + track id) and Genius
// (credits), fetched in parallel. A failure or missing config in one provider
// degrades to a warning rather than failing the whole request.

import { fetchGeniusCredits } from "./genius";
import { searchSpotifyTracks } from "./spotify";
import {
  MetadataConfigError,
  type Credit,
  type TrackMatch,
  type TrackMetadata,
} from "./types";

export type { Credit, TrackMatch, TrackMetadata } from "./types";

export async function lookupTrackMetadata(
  title: string,
  artist: string,
): Promise<TrackMetadata> {
  const warnings: string[] = [];
  let matches: TrackMatch[] = [];
  let credits: Credit[] = [];

  const [spotifyResult, geniusResult] = await Promise.allSettled([
    searchSpotifyTracks(title, artist),
    fetchGeniusCredits(title, artist),
  ]);

  if (spotifyResult.status === "fulfilled") {
    matches = spotifyResult.value;
  } else {
    warnings.push(describeError("Spotify", spotifyResult.reason));
  }

  if (geniusResult.status === "fulfilled") {
    credits = geniusResult.value;
  } else {
    warnings.push(describeError("Genius", geniusResult.reason));
  }

  return { matches, credits, warnings };
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
