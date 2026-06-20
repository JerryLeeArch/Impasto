import { NextResponse } from "next/server";
import { listArtistSuggestions } from "@/lib/db";
import { getAuthenticatedClient } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";

  return NextResponse.json({
    artists: await listArtistSuggestions(auth.supabase, { search }),
  });
}
