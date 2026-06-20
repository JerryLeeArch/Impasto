// Shared types + error classes for the external-metadata integrations
// (Spotify for album art / track id, Genius for credits).

export type Credit = {
  role: string;
  names: string[];
};

export type TrackMatch = {
  spotifyTrackId: string;
  title: string;
  artists: string[];
  albumTitle: string;
  coverUrl: string | null;
  releaseDate: string | null;
  spotifyUrl: string;
};

export type TrackMetadata = {
  matches: TrackMatch[];
  credits: Credit[];
  // Human-readable notes about partial failures (e.g. a provider not being
  // configured yet). The endpoint still returns 200 so the UI can degrade.
  warnings: string[];
};

// Thrown when a provider's credentials are missing. Surfaced as a warning, not
// a hard error, so the app keeps working before keys are added.
export class MetadataConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetadataConfigError";
  }
}

// Thrown when a configured provider call fails (network / bad response).
export class MetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetadataError";
  }
}
