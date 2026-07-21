const isDev = process.env.NODE_ENV !== "production";

const spotifyScriptOrigins =
  "https://open.spotify.com https://embed-cdn.spotifycdn.com";

const connectSrc = isDev
  ? "connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321 http://localhost:54321 ws://localhost:54321 https://*.supabase.co wss://*.supabase.co"
  : "connect-src 'self' https://*.supabase.co wss://*.supabase.co";

export function buildContentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: https:",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' ${spotifyScriptOrigins}`,
    "style-src 'self' 'unsafe-inline'",
    connectSrc,
    "frame-src https://open.spotify.com",
  ].join("; ");
}
