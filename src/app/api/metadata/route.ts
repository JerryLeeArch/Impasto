import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase/auth";
import { lookupTrackMetadata } from "@/lib/metadata";
import type { MetadataProvider } from "@/lib/metadata/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lookupWindowMs = 60_000;
const lookupsPerWindow = 30;
const lookupBuckets = new Map<string, { count: number; resetAt: number }>();

// GET /api/metadata?provider=spotify|genius&title=...&artist=...
export async function GET(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") ?? "").trim();
  const artist = (searchParams.get("artist") ?? "").trim();
  const provider = parseProvider(searchParams.get("provider"));

  if (!provider) {
    return NextResponse.json(
      { error: "Provider must be spotify or genius." },
      { status: 400 },
    );
  }

  if (!title) {
    return NextResponse.json(
      { error: "A song title is required." },
      { status: 400 },
    );
  }

  if (title.length > 160 || artist.length > 80) {
    return NextResponse.json(
      { error: "Title or artist is too long." },
      { status: 400 },
    );
  }

  const rateLimit = consumeLookup(auth.user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many metadata lookups. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    const result = await lookupTrackMetadata(title, artist, provider);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Could not fetch metadata." },
      { status: 502 },
    );
  }
}

function parseProvider(value: string | null): MetadataProvider | null {
  if (value === "spotify" || value === "genius") {
    return value;
  }
  return null;
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
