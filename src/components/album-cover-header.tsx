"use client";

import { useQuery } from "@tanstack/react-query";
import { Music } from "lucide-react";
import type { AlbumCover } from "@/lib/metadata";
import { fetchArtwork } from "./use-artwork";

export function AlbumCoverHeader({
  albumTitle,
  artists,
  fallbackCoverUrl,
  onBack,
}: {
  albumTitle: string;
  // From a logged track — Spotify's album credits win once they arrive.
  artists: string[];
  // Shown while the lookup is in flight, and kept if Spotify has no match.
  fallbackCoverUrl: string | null;
  onBack: () => void;
}) {
  // Title alone is unreliable: "Dark" matches an unrelated album.
  const primaryArtist = artists[0] ?? "";

  const { data: album } = useQuery<AlbumCover | null>({
    queryKey: [
      "artwork",
      "album",
      albumTitle.toLowerCase(),
      primaryArtist.toLowerCase(),
    ],
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: () =>
      fetchArtwork<AlbumCover>({
        type: "album",
        title: albumTitle,
        artist: primaryArtist,
      }),
  });

  const coverUrl = album?.imageUrl ?? fallbackCoverUrl;
  const creditedArtists = album?.artists.length ? album.artists : artists;

  return (
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
            loading="lazy"
          />
        ) : (
          <span className="app-cover-fallback flex h-48 w-48 items-center justify-center rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <Music size={40} strokeWidth={1.5} />
          </span>
        )}
        <div className="flex min-w-0 flex-col items-center gap-1">
          <span className="app-card-title break-words text-[30px] font-semibold leading-tight tracking-normal text-[#1d1d1f]">
            {albumTitle}
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
        </div>
      </div>
    </div>
  );
}
