import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// React/Turbopack need eval() for HMR + debugging in development only.
// Production never uses eval, so it stays out of the CSP there.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

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
