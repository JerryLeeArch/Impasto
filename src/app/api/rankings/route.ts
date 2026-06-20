import { NextResponse } from "next/server";
import {
  addFavoriteRankingItem,
  InputError,
  listFavoriteRanking,
  parseMusicKind,
  removeFavoriteRankingItem,
  reorderFavoriteRanking,
} from "@/lib/db";
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

  return NextResponse.json({
    ranking: await listFavoriteRanking(auth.supabase, musicKind),
  });
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const payload = await request.json();
    const musicKind = parseMusicKind(readRecordValue(payload, "musicKind"));
    const itemId = readRequiredString(payload, "itemId");

    return NextResponse.json({
      ranking: await addFavoriteRankingItem(auth.supabase, musicKind, itemId),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const payload = await request.json();
    const musicKind = parseMusicKind(readRecordValue(payload, "musicKind"));
    const itemIds = readStringArray(payload, "itemIds");

    return NextResponse.json({
      ranking: await reorderFavoriteRanking(auth.supabase, musicKind, itemIds),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const payload = await request.json();
    const musicKind = parseMusicKind(readRecordValue(payload, "musicKind"));
    const itemId = readRequiredString(payload, "itemId");

    return NextResponse.json({
      ranking: await removeFavoriteRankingItem(
        auth.supabase,
        musicKind,
        itemId,
      ),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function readRecordValue(payload: unknown, key: string) {
  return payload && typeof payload === "object"
    ? (payload as Record<string, unknown>)[key]
    : undefined;
}

function readRequiredString(payload: unknown, key: string) {
  const value = readRecordValue(payload, key);

  if (typeof value !== "string" || !value.trim()) {
    throw new InputError("Choose a reviewed song or album.");
  }

  return value;
}

function readStringArray(payload: unknown, key: string) {
  const value = readRecordValue(payload, key);

  if (!Array.isArray(value)) {
    throw new InputError("Ranking order is invalid.");
  }

  return value.filter((item): item is string => typeof item === "string");
}

function handleApiError(error: unknown) {
  if (error instanceof InputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json(
    { error: "Something went wrong while saving the ranking." },
    { status: 500 },
  );
}
