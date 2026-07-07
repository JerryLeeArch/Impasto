import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NEXT_PATH_COOKIE } from "@/lib/auth-redirect";

// The post-login destination travels in a short-lived cookie instead of a
// query param on redirect_to: Supabase matches redirect_to against the
// allowlist including the query string, so `?next=` made it fall back to the
// production Site URL.
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const cookieStore = await cookies();
  const nextParam =
    requestUrl.searchParams.get("next") ??
    decodeCookieValue(cookieStore.get(NEXT_PATH_COOKIE)?.value);
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const response = NextResponse.redirect(new URL(next, requestUrl.origin));
      response.cookies.delete(NEXT_PATH_COOKIE);
      return response;
    }
  }

  const response = NextResponse.redirect(
    new URL("/login?error=oauth_callback_failed", requestUrl.origin),
  );
  response.cookies.delete(NEXT_PATH_COOKIE);
  return response;
}

function decodeCookieValue(value: string | undefined) {
  if (!value) {
    return "";
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
