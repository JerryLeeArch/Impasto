"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  Music,
  Play,
  Plus,
} from "lucide-react";
import type { AlbumDetails, AlbumTrack } from "@/lib/metadata";

export type AlbumViewLog = {
  id: string;
  spotifyTrackId: string | null;
  body: string;
  rating: "like" | "neutral" | "dislike";
  createdAt: string;
  updatedAt: string;
  isMine?: boolean;
  ownerUsername?: string | null;
  ownerDisplayName?: string | null;
};

type AlbumViewProps = {
  albumTitle: string;
  artists: string[];
  fallbackCoverUrl: string | null;
  logs: AlbumViewLog[];
  onBack: () => void;
  onPlayTrack: (trackId: string, title: string) => void;
  onCreateTrackLog: (
    track: AlbumTrack,
    albumTitle: string,
    coverUrl: string | null,
  ) => void;
};

export function AlbumView({
  albumTitle,
  artists,
  fallbackCoverUrl,
  logs,
  onBack,
  onPlayTrack,
  onCreateTrackLog,
}: AlbumViewProps) {
  const [openTrackId, setOpenTrackId] = useState<string | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const primaryArtist = artists[0] ?? "";
  const {
    data: album,
    isPending,
    isError,
    error,
  } = useQuery<AlbumDetails | null>({
    queryKey: [
      "album-details",
      albumTitle.toLowerCase(),
      primaryArtist.toLowerCase(),
    ],
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: () => fetchAlbumDetails(albumTitle, primaryArtist),
  });

  const coverUrl = album?.imageUrl ?? fallbackCoverUrl;
  const creditedArtists = album?.artists.length ? album.artists : artists;
  const postsByTrackId = useMemo(() => {
    const grouped = new Map<string, AlbumViewLog[]>();
    for (const log of logs) {
      if (!log.spotifyTrackId) {
        continue;
      }
      const posts = grouped.get(log.spotifyTrackId) ?? [];
      posts.push(log);
      grouped.set(log.spotifyTrackId, posts);
    }
    return grouped;
  }, [logs]);

  function toggleTrack(trackId: string) {
    setOpenTrackId((current) => (current === trackId ? null : trackId));
    setOpenPostId(null);
  }

  function togglePost(postId: string) {
    setOpenPostId((current) => (current === postId ? null : postId));
  }

  return (
    <div className="grid gap-5">
      <div className="relative px-5 py-5">
        <button
          type="button"
          onClick={onBack}
          className="app-secondary-button absolute right-0 top-0 shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#6e6e73] shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition hover:text-[#1d1d1f]"
        >
          Back to feed
        </button>
        <div className="flex flex-col items-center gap-4 text-center">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={`Album art for ${albumTitle}`}
              width={192}
              height={192}
              className="h-48 w-48 rounded-md object-cover shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
            />
          ) : (
            <span className="app-cover-fallback flex h-48 w-48 items-center justify-center rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
              <Music size={40} strokeWidth={1.5} />
            </span>
          )}
          <div className="flex min-w-0 flex-col items-center gap-1">
            <span className="app-card-title break-words text-[30px] font-semibold leading-tight tracking-normal text-[#1d1d1f]">
              {album?.name ?? albumTitle}
            </span>
            <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
              <span className="app-muted break-words text-[15px] font-medium leading-tight text-[#6e6e73]">
                Album
              </span>
              {creditedArtists.map((artist) => (
                <span
                  key={artist}
                  className="app-muted break-words text-[13px] font-medium leading-tight text-[#6e6e73]"
                >
                  {artist}
                </span>
              ))}
            </div>
            {album?.spotifyUrl ? (
              <a
                href={album.spotifyUrl}
                target="_blank"
                rel="noreferrer"
                className="app-mini-link mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#86868b]"
              >
                Spotify
                <ExternalLink size={10} strokeWidth={1.8} />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <section
        className="app-card overflow-hidden rounded-lg bg-white"
        aria-labelledby="album-track-list-title"
      >
        <div className="flex items-baseline justify-between border-b border-[#d2d2d7]/55 px-5 py-3">
          <h2
            id="album-track-list-title"
            className="app-title text-[15px] font-semibold"
          >
            Tracks
          </h2>
          {album ? (
            <span className="app-muted text-[12px] font-medium">
              {album.totalTracks}
            </span>
          ) : null}
        </div>

        {isPending ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2
              className="app-muted animate-spin"
              size={20}
              strokeWidth={1.7}
            />
          </div>
        ) : isError ? (
          <div className="px-5 py-6 text-center">
            <p className="app-title text-[14px] font-semibold">
              Could not load Spotify tracks.
            </p>
            <p className="app-muted mt-1 text-[12px] font-medium">
              {error instanceof Error ? error.message : "Try again later."}
            </p>
          </div>
        ) : !album ? (
          <div className="px-5 py-6 text-center">
            <p className="app-title text-[14px] font-semibold">
              Album not found on Spotify.
            </p>
            <p className="app-muted mt-1 text-[12px] font-medium">
              Your Impasto entries are still shown below.
            </p>
          </div>
        ) : album.tracks.length === 0 ? (
          <p className="app-muted px-5 py-6 text-center text-[13px] font-medium">
            Spotify did not return any tracks for this album.
          </p>
        ) : (
          <div>
            {album.tracks.map((track, index) => {
              const startsDisc =
                index === 0 ||
                album.tracks[index - 1]?.discNumber !== track.discNumber;
              const isMultiDisc =
                album.tracks[album.tracks.length - 1]?.discNumber > 1;
              const posts = postsByTrackId.get(track.spotifyTrackId) ?? [];
              const isTrackOpen = openTrackId === track.spotifyTrackId;

              return (
                <Fragment key={track.spotifyTrackId}>
                  {startsDisc && isMultiDisc ? (
                    <div className="app-muted border-b border-[#d2d2d7]/40 bg-[#f5f5f7]/55 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide">
                      Disc {track.discNumber}
                    </div>
                  ) : null}
                  <div className="border-b border-[#d2d2d7]/40 last:border-b-0">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isTrackOpen}
                      onClick={() => toggleTrack(track.spotifyTrackId)}
                      onKeyDown={(event) => {
                        if (event.currentTarget !== event.target) {
                          return;
                        }
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleTrack(track.spotifyTrackId);
                        }
                      }}
                      className="app-album-track-row group grid min-h-14 cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 outline-none transition-colors sm:grid-cols-[32px_minmax(0,1fr)_52px_auto] sm:px-5"
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPlayTrack(track.spotifyTrackId, track.title);
                        }}
                        className="app-icon-button flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-medium"
                        aria-label={`Play ${track.title} on Spotify`}
                      >
                        <span className="group-hover:hidden group-focus-within:hidden">
                          {track.trackNumber}
                        </span>
                        <Play
                          size={12}
                          strokeWidth={2}
                          className="ml-0.5 hidden fill-current group-hover:block group-focus-within:block"
                        />
                      </button>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="app-title truncate text-[14px] font-semibold">
                            {track.title}
                          </span>
                          {track.explicit ? (
                            <span
                              title="Explicit"
                              aria-label="Explicit"
                              className="app-explicit-badge flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-[10px] font-bold leading-none"
                            >
                              E
                            </span>
                          ) : null}
                          {posts.length > 0 ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#9bd36a]"
                              title={`${posts.length} Impasto ${
                                posts.length === 1 ? "post" : "posts"
                              }`}
                            />
                          ) : null}
                        </div>
                        <span className="app-muted block truncate text-[12px] font-medium">
                          {track.artists.join(", ")}
                        </span>
                      </div>
                      <span className="app-muted hidden text-right text-[12px] font-medium sm:block">
                        {formatDuration(track.durationMs)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCreateTrackLog(
                              track,
                              album.name,
                              album.imageUrl,
                            );
                          }}
                          className="app-card-action inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-white px-2.5 text-[12px] font-semibold text-[#1d1d1f] transition"
                          aria-label={`Add an Impasto for ${track.title}`}
                        >
                          <Plus size={13} strokeWidth={1.8} />
                          <span className="hidden sm:inline">Impasto</span>
                        </button>
                        <ChevronDown
                          size={14}
                          strokeWidth={1.8}
                          aria-hidden="true"
                          className={`app-muted shrink-0 transition-transform duration-200 ${
                            isTrackOpen ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </div>

                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                        isTrackOpen
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0"
                      }`}
                      aria-hidden={!isTrackOpen}
                    >
                      <div className="overflow-hidden">
                        <div className="app-album-track-details border-t border-[#d2d2d7]/35 px-4 py-2 sm:px-5">
                          {posts.length === 0 ? (
                            <p className="app-muted px-9 py-3 text-[12px] font-medium">
                              No Impasto posts yet.
                            </p>
                          ) : (
                            posts.map((post) => {
                              const isPostOpen = openPostId === post.id;
                              return (
                                <div
                                  key={post.id}
                                  className="border-b border-[#d2d2d7]/35 last:border-b-0"
                                >
                                  <button
                                    type="button"
                                    onClick={() => togglePost(post.id)}
                                    aria-expanded={isPostOpen}
                                    className="app-album-post-row flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors"
                                  >
                                    <span className="app-title min-w-0 truncate text-[13px] font-semibold">
                                      {formatOwner(post)}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-3">
                                      <span className="app-muted text-[11px] font-medium">
                                        {formatPostDate(post.createdAt)}
                                      </span>
                                      <ChevronDown
                                        size={13}
                                        strokeWidth={1.8}
                                        className={`app-muted shrink-0 transition-transform duration-200 ${
                                          isPostOpen ? "rotate-180" : ""
                                        }`}
                                      />
                                    </span>
                                  </button>
                                  <div
                                    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                                      isPostOpen
                                        ? "grid-rows-[1fr] opacity-100"
                                        : "grid-rows-[0fr] opacity-0"
                                    }`}
                                    aria-hidden={!isPostOpen}
                                  >
                                    <div className="overflow-hidden">
                                      <article className="app-credit-panel mx-3 mb-3 rounded-lg px-3 py-3">
                                        <p className="app-body whitespace-pre-wrap break-words text-[13px] leading-5">
                                          {post.body}
                                        </p>
                                        <div className="app-muted mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium">
                                          <span
                                            className="app-rating-badge inline-flex items-center gap-1.5"
                                            data-rating={post.rating}
                                          >
                                            <span className="app-rating-dot h-1.5 w-1.5 rounded-full" />
                                            {formatRating(post.rating)}
                                          </span>
                                          {post.updatedAt !==
                                          post.createdAt ? (
                                            <span>
                                              Edited{" "}
                                              {formatPostDate(post.updatedAt)}
                                            </span>
                                          ) : null}
                                        </div>
                                      </article>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

async function fetchAlbumDetails(
  title: string,
  artist: string,
): Promise<AlbumDetails | null> {
  const params = new URLSearchParams({ title, artist });
  const response = await fetch(`/api/albums/details?${params.toString()}`, {
    cache: "no-store",
  });
  const data = (await response.json()) as {
    album?: AlbumDetails | null;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "Could not load album details.");
  }
  return data.album ?? null;
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

const postDateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatPostDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : postDateFormatter.format(date);
}

function formatOwner(post: AlbumViewLog) {
  if (post.ownerUsername) {
    return `@${post.ownerUsername}`;
  }
  if (post.ownerDisplayName) {
    return post.ownerDisplayName;
  }
  return post.isMine === false ? "User" : "@me";
}

function formatRating(rating: AlbumViewLog["rating"]) {
  return rating === "like"
    ? "Like"
    : rating === "dislike"
      ? "Dislike"
      : "Neutral";
}
