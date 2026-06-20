import { NextResponse } from "next/server";
import {
  InputError,
  listFriends,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
} from "@/lib/db";
import { getAuthenticatedClient } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthenticatedClient();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  return NextResponse.json({ friends: await listFriends(auth.supabase) });
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as { username?: unknown };
    if (typeof body.username !== "string" || !body.username.trim()) {
      throw new InputError("Enter a username.");
    }

    const friends = await sendFriendRequest(auth.supabase, body.username);
    return NextResponse.json({ friends });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getAuthenticatedClient();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = (await request.json()) as {
      friendshipId?: unknown;
      accept?: unknown;
    };
    if (typeof body.friendshipId !== "string") {
      throw new InputError("Invalid friend request.");
    }

    const friends = await respondFriendRequest(
      auth.supabase,
      body.friendshipId,
      body.accept === true,
    );
    return NextResponse.json({ friends });
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

    const body = (await request.json()) as { friendshipId?: unknown };
    if (typeof body.friendshipId !== "string") {
      throw new InputError("Invalid friend.");
    }

    const friends = await removeFriend(auth.supabase, body.friendshipId);
    return NextResponse.json({ friends });
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
    { error: "Something went wrong while updating your friends." },
    { status: 500 },
  );
}
