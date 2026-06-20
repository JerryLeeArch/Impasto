import { NextResponse } from "next/server";
import {
  createLog,
  InputError,
  listFeed,
  listLogs,
  parseLogInput,
  type CategoryFilter,
  type FeedScope,
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
  const itemId = searchParams.get("itemId") ?? "";
  const albumTitle = searchParams.get("albumTitle") ?? "";
  const search = searchParams.get("search") ?? "";
  const scope = parseScope(searchParams.get("scope"));

  // Main home feed (own + friends' public logs) when scope is set and not
  // drilling into a specific item/album.
  if (scope && !itemId && !albumTitle) {
    return NextResponse.json({
      logs: await listFeed(auth.supabase, { scope, search }),
    });
  }

  const category = parseCategoryFilter(searchParams.get("category"));
  return NextResponse.json({
    logs: await listLogs(auth.supabase, {
      category,
      itemId,
      albumTitle,
      search,
    }),
  });
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const input = parseLogInput(await request.json());
    const log = await createLog(auth.supabase, input);

    return NextResponse.json({ log }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

function parseScope(value: string | null): FeedScope | null {
  if (value === "all" || value === "mine" || value === "friends") {
    return value;
  }

  return null;
}

function parseCategoryFilter(value: string | null): CategoryFilter {
  if (
    value === "music" ||
    value === "image" ||
    value === "other" ||
    value === "all"
  ) {
    return value;
  }

  return "all";
}

function handleApiError(error: unknown) {
  if (error instanceof InputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json(
    { error: "Something went wrong while saving the log." },
    { status: 500 },
  );
}
