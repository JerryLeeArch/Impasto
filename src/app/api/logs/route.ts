import { NextResponse } from "next/server";
import {
  createLog,
  InputError,
  listLogs,
  parseLogInput,
  type CategoryFilter,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = parseCategoryFilter(searchParams.get("category"));
  const itemId = searchParams.get("itemId") ?? "";
  const albumTitle = searchParams.get("albumTitle") ?? "";
  const search = searchParams.get("search") ?? "";

  return NextResponse.json({
    logs: listLogs({ category, itemId, albumTitle, search }),
  });
}

export async function POST(request: Request) {
  try {
    const input = parseLogInput(await request.json());
    const log = createLog(input);

    return NextResponse.json({ log }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
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
