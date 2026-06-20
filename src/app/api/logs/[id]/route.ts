import { NextResponse } from "next/server";
import { InputError, parseLogInput, softDeleteLog, updateLog } from "@/lib/db";
import { getAuthenticatedClient } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await context.params;
    const input = parseLogInput(await request.json());
    const log = await updateLog(auth.supabase, id, input);

    if (!log) {
      return NextResponse.json({ error: "Log not found." }, { status: 404 });
    }

    return NextResponse.json({ log });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const { id } = await context.params;
    const deleted = await softDeleteLog(auth.supabase, id);

    if (!deleted) {
      return NextResponse.json({ error: "Log not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
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
