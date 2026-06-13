import { NextResponse } from "next/server";
import { listMusicItems, parseMusicKind } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const musicKind = parseMusicKind(searchParams.get("musicKind"));
  const search = searchParams.get("search") ?? "";

  return NextResponse.json({
    items: listMusicItems({ musicKind, search }),
  });
}
