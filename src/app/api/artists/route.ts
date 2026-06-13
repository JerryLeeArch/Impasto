import { NextResponse } from "next/server";
import { listArtistSuggestions } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";

  return NextResponse.json({
    artists: listArtistSuggestions({ search }),
  });
}
