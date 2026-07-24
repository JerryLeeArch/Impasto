import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase/auth";
import {
  lookupAlbumCover,
  lookupArtistProfile,
  lookupTrackArtwork,
} from "@/lib/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lookupWindowMs = 60_000;
const lookupsPerWindow = 60;
const lookupBuckets = new Map<string, { count: number; resetAt: number }>();

// GET /api/artwork?type=artist&name=...
// GET /api/artwork?type=album&title=...&artist=...
// GET /api/artwork?type=track&id=...
// Backs the headers on the artist and album views. A miss returns
// { artwork: null } rather than an error so the view still renders its logs.
export async function GET(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const name = (searchParams.get("name") ?? "").trim();
  const title = (searchParams.get("title") ?? "").trim();
  const artist = (searchParams.get("artist") ?? "").trim();
  const id = (searchParams.get("id") ?? "").trim();

  if (type !== "artist" && type !== "album" && type !== "track") {
    return NextResponse.json(
      { error: "Type must be artist, album, or track." },
      { status: 400 },
    );
  }

  const required = type === "artist" ? name : type === "album" ? title : id;
  if (!required) {
    return NextResponse.json(
      {
        error:
          type === "artist"
            ? "An artist name is required."
            : type === "album"
              ? "An album title is required."
              : "A Spotify track ID is required.",
      },
      { status: 400 },
    );
  }

  if (name.length > 80 || title.length > 160 || artist.length > 80) {
    return NextResponse.json({ error: "Query is too long." }, { status: 400 });
  }
  if (type === "track" && !/^[A-Za-z0-9]{22}$/.test(id)) {
    return NextResponse.json(
      { error: "Spotify track ID is invalid." },
      { status: 400 },
    );
  }

  const rateLimit = consumeLookup(auth.user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many artwork lookups. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    const artwork =
      type === "artist"
        ? await lookupArtistProfile(name)
        : type === "album"
          ? await lookupAlbumCover(title, artist)
          : await lookupTrackArtwork(id);

    return NextResponse.json({ artwork });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Could not fetch artwork." },
      { status: 502 },
    );
  }
}

function consumeLookup(userId: string) {
  const now = Date.now();
  const current = lookupBuckets.get(userId);
  if (!current || current.resetAt <= now) {
    lookupBuckets.set(userId, { count: 1, resetAt: now + lookupWindowMs });
    pruneExpiredBuckets(now);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= lookupsPerWindow) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function pruneExpiredBuckets(now: number) {
  if (lookupBuckets.size < 1_000) {
    return;
  }
  for (const [userId, bucket] of lookupBuckets) {
    if (bucket.resetAt <= now) {
      lookupBuckets.delete(userId);
    }
  }
}
