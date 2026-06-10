import { NextResponse } from "next/server";
import { InputError, parseLogInput, softDeleteLog, updateLog } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const input = parseLogInput(await request.json());
    const log = updateLog(id, input);

    if (!log) {
      return NextResponse.json({ error: "Log not found." }, { status: 404 });
    }

    return NextResponse.json({ log });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const deleted = softDeleteLog(id);

  if (!deleted) {
    return NextResponse.json({ error: "Log not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

function handleApiError(error: unknown) {
  if (error instanceof InputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json(
    { error: "Something went wrong while updating the log." },
    { status: 500 },
  );
}
