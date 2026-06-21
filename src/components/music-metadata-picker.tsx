"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Music, Trash2 } from "lucide-react";
import type {
  Credit,
  MetadataProvider,
  TrackMatch,
  TrackMetadata,
} from "@/lib/metadata/types";

type LookupPhase =
  | "idle"
  | "spotify-loading"
  | "spotify-results"
  | "genius-loading"
  | "genius-review";

type MusicMetadataPickerProps = {
  title: string;
  artists: string[];
  linkedTrackId: string;
  hasCover: boolean;
  onApplyTrack: (match: TrackMatch) => void;
  onClearTrack: () => void;
  onApplyCredits: (credits: Credit[]) => void;
};

export function MusicMetadataPicker({
  title,
  artists,
  linkedTrackId,
  hasCover,
  onApplyTrack,
  onClearTrack,
  onApplyCredits,
}: MusicMetadataPickerProps) {
  const [phase, setPhase] = useState<LookupPhase>("idle");
  const [matches, setMatches] = useState<TrackMatch[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<TrackMatch | null>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [spotifyQueryKey, setSpotifyQueryKey] = useState("");
  const [geniusSource, setGeniusSource] = useState("");
  const requestController = useRef<AbortController | null>(null);

  const normalizedTitle = title.trim();
  const primaryArtist = artists[0]?.trim() ?? "";
  const currentQueryKey = `${normalizedTitle.toLowerCase()}\u0000${primaryArtist.toLowerCase()}`;
  const isBusy = phase === "spotify-loading" || phase === "genius-loading";
  const spotifyResultsAreStale =
    phase === "spotify-results" && spotifyQueryKey !== currentQueryKey;

  useEffect(
    () => () => {
      requestController.current?.abort();
    },
    [],
  );

  function startRequest() {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setError(null);
    setWarnings([]);
    return controller;
  }

  function finishRequest(controller: AbortController) {
    if (requestController.current === controller) {
      requestController.current = null;
    }
  }

  async function searchSpotify() {
    if (!normalizedTitle || isBusy) {
      return;
    }

    const controller = startRequest();
    setPhase("spotify-loading");
    setMatches([]);
    setSelectedMatch(null);
    setCredits([]);
    setSpotifyQueryKey(currentQueryKey);

    try {
      const result = await requestMetadata(
        "spotify",
        normalizedTitle,
        primaryArtist,
        controller.signal,
      );
      if (requestController.current !== controller) {
        return;
      }
      setMatches(result.matches);
      setWarnings(result.warnings);
      setPhase("spotify-results");
    } catch (requestError) {
      if (!isAbortError(requestError) && requestController.current === controller) {
        setError(toErrorMessage(requestError, "Could not search Spotify."));
        setPhase("idle");
      }
    } finally {
      finishRequest(controller);
    }
  }

  async function searchGenius(
    lookupTitle = normalizedTitle,
    lookupArtist = primaryArtist,
  ) {
    if (!lookupTitle.trim() || isBusy) {
      return;
    }

    const controller = startRequest();
    const source = [lookupTitle, lookupArtist].filter(Boolean).join(" — ");
    setPhase("genius-loading");
    setMatches([]);
    setSelectedMatch(null);
    setCredits([]);
    setGeniusSource(source);

    try {
      const result = await requestMetadata(
        "genius",
        lookupTitle,
        lookupArtist,
        controller.signal,
      );
      if (requestController.current !== controller) {
        return;
      }
      setCredits(result.credits);
      setWarnings(result.warnings);
      setPhase("genius-review");
    } catch (requestError) {
      if (!isAbortError(requestError) && requestController.current === controller) {
        setError(
          toErrorMessage(requestError, "Could not fetch Genius credits."),
        );
        setPhase("idle");
      }
    } finally {
      finishRequest(controller);
    }
  }

  function confirmSpotifyMatch() {
    if (!selectedMatch || spotifyResultsAreStale || isBusy) {
      return;
    }

    const match = selectedMatch;
    onApplyTrack(match);
    setMatches([]);
    setSelectedMatch(null);
    void searchGenius(match.title, match.artists[0] ?? "");
  }

  function confirmCredits() {
    if (credits.length === 0) {
      return;
    }
    onApplyCredits(credits);
    closeReview();
  }

  function closeReview() {
    setMatches([]);
    setSelectedMatch(null);
    setCredits([]);
    setWarnings([]);
    setError(null);
    setGeniusSource("");
    setPhase("idle");
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void searchSpotify()}
          disabled={!normalizedTitle || isBusy}
          className="app-credit-toggle flex h-10 items-center justify-center gap-2 rounded-lg border text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === "spotify-loading" ? (
            <Loader2 size={15} strokeWidth={1.8} className="animate-spin" />
          ) : (
            <Music size={15} strokeWidth={1.8} />
          )}
          {phase === "spotify-loading" ? "Searching…" : "Find on Spotify"}
        </button>
        <button
          type="button"
          onClick={() => void searchGenius()}
          disabled={!normalizedTitle || isBusy}
          className="app-credit-toggle flex h-10 items-center justify-center gap-2 rounded-lg border text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {phase === "genius-loading" ? (
            <Loader2 size={15} strokeWidth={1.8} className="animate-spin" />
          ) : (
            <Music size={15} strokeWidth={1.8} />
          )}
          {phase === "genius-loading" ? "Searching…" : "Find Genius credits"}
        </button>
      </div>

      {error ? (
        <p className="text-[12px] font-medium text-[#c9342f]">{error}</p>
      ) : null}

      {warnings.map((warning) => (
        <p key={warning} className="text-[12px] font-medium text-[#9a6a00]">
          {warning}
        </p>
      ))}

      {phase === "spotify-results" ? (
        <div className="app-credit-panel grid gap-1 rounded-lg border p-2">
          {matches.length > 0 ? (
            matches.map((match) => {
              const isSelected =
                selectedMatch?.spotifyTrackId === match.spotifyTrackId;
              return (
                <button
                  key={match.spotifyTrackId}
                  type="button"
                  onClick={() => setSelectedMatch(match)}
                  aria-pressed={isSelected}
                  className="app-metadata-result app-suggestion-button flex items-center gap-3 rounded-md border border-transparent px-2 py-2 text-left transition"
                >
                  {match.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={match.coverUrl}
                      alt=""
                      width={40}
                      height={40}
                      className="h-10 w-10 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="app-metadata-cover-placeholder flex h-10 w-10 shrink-0 items-center justify-center rounded">
                      <Music size={16} strokeWidth={1.7} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="app-metadata-title block truncate text-[14px] font-semibold">
                      {match.title}
                    </span>
                    <span className="app-metadata-muted block truncate text-[12px] font-medium">
                      {[
                        match.artists.join(", "),
                        match.albumTitle,
                        match.releaseDate,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="app-metadata-muted px-2 py-2 text-[12px] font-medium">
              No Spotify matches found. You can still search Genius directly.
            </p>
          )}

          {spotifyResultsAreStale ? (
            <p className="px-2 pt-1 text-[11px] font-medium text-[#9a6a00]">
              The title or artist changed. Search again before confirming.
            </p>
          ) : null}

          {matches.length > 0 ? (
            <button
              type="button"
              onClick={confirmSpotifyMatch}
              disabled={!selectedMatch || spotifyResultsAreStale}
              className="app-credit-toggle mt-1 flex h-9 w-full items-center justify-center rounded-md border text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirm Spotify match
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === "genius-review" ? (
        <div className="app-credit-panel grid gap-2 rounded-lg border p-3">
          <div>
            <p className="app-metadata-title text-[13px] font-semibold">
              Confirm Genius credits
            </p>
            <p className="app-metadata-muted mt-0.5 text-[11px] font-medium">
              {geniusSource || "Current song"}
              {credits.length > 0
                ? ` · ${credits.length} credit${credits.length === 1 ? "" : "s"}`
                : ""}
            </p>
          </div>
          {credits.length > 0 ? (
            <div className="grid max-h-72 gap-1.5 overflow-y-auto overscroll-contain pr-1">
              {credits.map((credit) => (
                <div
                  key={`${credit.role}-${credit.names.join("|")}`}
                  className="app-metadata-credit-card rounded-md px-2.5 py-2"
                >
                  <p className="app-metadata-muted text-[11px] font-semibold">
                    {credit.role}
                  </p>
                  <p className="app-metadata-title text-[13px] font-medium">
                    {credit.names.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="app-metadata-muted text-[12px] font-medium">
              No Genius credits found for this song.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={closeReview}
              className="app-credit-toggle flex h-9 items-center justify-center rounded-md border text-[12px] font-semibold transition"
            >
              Close
            </button>
            <button
              type="button"
              onClick={confirmCredits}
              disabled={credits.length === 0}
              className="app-credit-toggle flex h-9 items-center justify-center rounded-md border text-[12px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add credits
            </button>
          </div>
        </div>
      ) : null}

      {linkedTrackId ? (
        <div className="flex items-center justify-between gap-2">
          <p className="app-metadata-muted inline-flex items-center gap-1.5 text-[12px] font-medium">
            <Music size={12} strokeWidth={1.8} />
            Spotify track linked{hasCover ? " · album art attached" : ""}.
          </p>
          <button
            type="button"
            onClick={onClearTrack}
            className="app-delete-button inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold text-[#86868b] transition hover:bg-[#fff7f3] hover:text-[#a35f36]"
          >
            <Trash2 size={12} strokeWidth={1.7} />
            Unlink
          </button>
        </div>
      ) : null}
    </div>
  );
}

async function requestMetadata(
  provider: MetadataProvider,
  title: string,
  artist: string,
  signal: AbortSignal,
): Promise<TrackMetadata> {
  const params = new URLSearchParams({ provider, title });
  if (artist) {
    params.set("artist", artist);
  }

  const response = await fetch(`/api/metadata?${params.toString()}`, {
    cache: "no-store",
    signal,
  });
  const data = (await response.json()) as TrackMetadata & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Could not fetch metadata.");
  }
  return {
    matches: Array.isArray(data.matches) ? data.matches : [],
    credits: Array.isArray(data.credits) ? data.credits : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
  };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
