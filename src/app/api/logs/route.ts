import { NextResponse } from "next/server";
import {
  createLog,
  InputError,
  listFeed,
  listFeedPage,
  listLogs,
  parseFeedPageSize,
  parseLogInput,
  type FeedScope,
} from "@/lib/db";
import { getAuthenticatedClient } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId") ?? "";
    const albumTitle = searchParams.get("albumTitle") ?? "";
    const search = searchParams.get("search") ?? "";
    const scope = parseScope(searchParams.get("scope"));

    // Main home feed (own + friends' public logs) uses an opaque cursor so the
    // browser never has to download every log at once.
    if (scope && !itemId && !albumTitle) {
      const page = await listFeedPage(auth.supabase, {
        scope,
        search,
        cursor: searchParams.get("cursor"),
        limit: parseFeedPageSize(searchParams.get("limit")),
      });
      return NextResponse.json(page);
    }

    // Album drill-downs show the signed-in user's logs plus public logs from
    // accepted friends. listFeed enforces that visibility boundary; the exact
    // comparison below removes loose search matches from titles and notes.
    if (albumTitle && !itemId) {
      const normalizedAlbumTitle = normalizeAlbumTitle(albumTitle);
      const logs = await listFeed(auth.supabase, {
        scope: "all",
        search: albumTitle,
      });
      return NextResponse.json({
        logs: logs.filter(
          (log) => normalizeAlbumTitle(log.albumTitle) === normalizedAlbumTitle,
        ),
      });
    }

    return NextResponse.json({
      logs: await listLogs(auth.supabase, {
        itemId,
        albumTitle,
        search,
      }),
    });
  } catch (error) {
    return handleLoadError(error);
  }
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

function normalizeAlbumTitle(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseScope(value: string | null): FeedScope | null {
  if (value === "all" || value === "mine" || value === "friends") {
    return value;
  }

  return null;
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

function handleLoadError(error: unknown) {
  if (error instanceof InputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json(
    { error: "Something went wrong while loading logs." },
    { status: 500 },
  );
}
