import { NextResponse } from "next/server";
import {
  getProfile,
  InputError,
  setDefaultVisibility,
  setUsername,
} from "@/lib/db";
import { getAuthenticatedClient } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({ profile: await getProfile(auth.supabase) });
}

export async function PATCH(request: Request) {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as {
      username?: unknown;
      defaultVisibility?: unknown;
    };

    if (body.defaultVisibility !== undefined) {
      if (
        body.defaultVisibility !== "public" &&
        body.defaultVisibility !== "private"
      ) {
        throw new InputError("Choose a valid visibility.");
      }
      const profile = await setDefaultVisibility(
        auth.supabase,
        body.defaultVisibility,
      );
      return NextResponse.json({ profile });
    }

    if (typeof body.username !== "string") {
      throw new InputError("Enter a username.");
    }

    const profile = await setUsername(auth.supabase, body.username);
    return NextResponse.json({ profile });
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
    { error: "Something went wrong while updating your profile." },
    { status: 500 },
  );
}
