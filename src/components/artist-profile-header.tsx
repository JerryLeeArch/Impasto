"use client";

import { useQuery } from "@tanstack/react-query";
import { User } from "lucide-react";
import type { ArtistProfile } from "@/lib/metadata";
import { fetchArtwork } from "./use-artwork";

export function ArtistProfileHeader({
  artist,
  onBack,
}: {
  artist: string;
  onBack: () => void;
}) {
  // A missing profile is not an error state here — the logs below are the point
  // of the view, so a lookup failure just falls back to the plain name.
  const { data: profile } = useQuery<ArtistProfile | null>({
    queryKey: ["artwork", "artist", artist.toLowerCase()],
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: () => fetchArtwork<ArtistProfile>({ type: "artist", name: artist }),
  });

  return (
    <div className="app-selected-item flex items-center justify-between gap-3 rounded-lg bg-[#f5f5f7] px-5 py-5">
      <div className="flex min-w-0 items-center gap-4">
        {profile?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.imageUrl}
            alt=""
            width={72}
            height={72}
            className="h-18 w-18 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="app-cover-fallback flex h-18 w-18 shrink-0 items-center justify-center rounded-full">
            <User size={26} strokeWidth={1.6} />
          </span>
        )}
        <span className="app-card-title min-w-0 break-words text-[30px] font-semibold leading-tight tracking-normal text-[#1d1d1f]">
          {profile?.name ?? artist}
        </span>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="app-secondary-button shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#6e6e73] shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition hover:text-[#1d1d1f]"
      >
        Back to feed
      </button>
    </div>
  );
}
