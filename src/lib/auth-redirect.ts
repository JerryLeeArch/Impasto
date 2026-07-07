// Cookie that carries the post-login destination through the OAuth round
// trip. It cannot ride on redirect_to as a query param: Supabase matches
// redirect_to against the redirect allowlist including the query string, and
// unmatched URLs silently fall back to the production Site URL.
export const NEXT_PATH_COOKIE = "impasto-next-path";
