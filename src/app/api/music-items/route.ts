import { NextResponse } from "next/server";
import { listMusicItems, parseMusicKind } from "@/lib/db";
import { getAuthenticatedClient } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const musicKind = parseMusicKind(searchParams.get("musicKind"));
  const search = searchParams.get("search") ?? "";

  return NextResponse.json({
    items: await listMusicItems(auth.supabase, { musicKind, search }),
  });
}
