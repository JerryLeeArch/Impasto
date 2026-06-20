import { NextResponse } from "next/server";
import { getAuthenticatedClient } from "@/lib/supabase/auth";
import { lookupTrackMetadata } from "@/lib/metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/metadata?title=...&artist=...
// Auth-gated so only signed-in users consume the Spotify/Genius quota. Returns
// { matches, credits, warnings } — always 200 unless the title is missing or an
// unexpected error occurs (provider-specific failures come back as warnings).
export async function GET(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") ?? "").trim();
  const artist = (searchParams.get("artist") ?? "").trim();

  if (!title) {
    return NextResponse.json(
      { error: "A song title is required." },
      { status: 400 },
    );
  }

  try {
    const result = await lookupTrackMetadata(title, artist);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Could not fetch metadata." },
      { status: 502 },
    );
  }
}
