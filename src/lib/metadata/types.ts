// Shared types + error classes for the external-metadata integrations
// (Spotify for album art / track id, Genius for credits).

export type Credit = {
  role: string;
  names: string[];
};

export type MetadataProvider = "spotify" | "genius";

export type TrackMatch = {
  spotifyTrackId: string;
  title: string;
  artists: string[];
  albumTitle: string;
  coverUrl: string | null;
  releaseDate: string | null;
  explicit: boolean;
};

export type TrackMetadata = {
  matches: TrackMatch[];
  credits: Credit[];
  // A provider configuration or network failure is returned as a warning so
  // users can continue editing the log without external metadata.
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
