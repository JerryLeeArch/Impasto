import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// The iFrame Embed API that drives the persistent bottom player bar loads a
// bootstrap from open.spotify.com, which then loads the real player script
// from Spotify's CDN. That script calls eval() internally, so unsafe-eval is
// needed in production too, not just for HMR.
const spotifyScriptOrigins =
  "https://open.spotify.com https://embed-cdn.spotifycdn.com";
const scriptSrc = `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${spotifyScriptOrigins}`;

// Local Supabase runs on http://127.0.0.1:54321 in dev; production talks to the
// hosted project over https/wss. Allow the right origins per environment.
const connectSrc = isDev
  ? "connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321 http://localhost:54321 ws://localhost:54321 https://*.supabase.co wss://*.supabase.co"
  : "connect-src 'self' https://*.supabase.co wss://*.supabase.co";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
              "form-action 'self'",
              "img-src 'self' data: https:",
              scriptSrc,
              "style-src 'self' 'unsafe-inline'",
              connectSrc,
              // Spotify embed player (in-browser iframe).
              "frame-src https://open.spotify.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
