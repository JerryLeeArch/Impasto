# Impasto

_A canvas for your evolving tastes._

## About

Impasto is a digital archive designed to record the continuous evolution of personal preference. Just as the impasto painting technique builds depth and texture through thick, expressive layers of paint, this project captures the shifting layers of your inspirations, choices, and identity over time.

## Architecture

- Next.js on Vercel
- Supabase Auth with Google OAuth
- Supabase PostgreSQL with Row Level Security on every user-owned table

The browser only receives the Supabase publishable key. Database writes use the
signed-in user's session, and PostgreSQL policies enforce ownership again at the
database boundary.

## Local development

1. Create a Supabase project.
2. Run `supabase/migrations/202606200001_initial.sql` in the Supabase SQL Editor.
3. Enable Google under Authentication > Providers, and disable Email sign-in if
   Google-only access is desired. Kakao is not used by the application.
   Google's authorized redirect URI is the Supabase callback shown in the
   provider settings (`https://PROJECT_REF.supabase.co/auth/v1/callback`).
4. Copy `.env.example` to `.env.local` and enter the project URL and publishable
   key.
5. Add `http://localhost:3000/auth/callback` to the allowed redirect URLs in
   Supabase Authentication > URL Configuration.
6. Run `npm ci`, then `npm run dev`.

## Deploy to Vercel

1. Import the Git repository into Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Production, Preview, and
   Development environment variables.
3. Set the Supabase Site URL to the production domain and add both production
   and Vercel preview callback patterns to the allowed redirect URLs.
4. Add the custom domain in Vercel. Vercel provisions TLS after DNS verification.

Never add a Supabase secret key to Vercel. The application deliberately uses the
publishable key plus each user's session so Row Level Security remains active.

## Migrate the existing SQLite archive

After deploying and signing in with Google once:

1. Copy your user UUID from Supabase Authentication > Users.
2. Create a local `.env.migration` containing `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SECRET_KEY`, and `IMPASTO_USER_ID`.
3. Load those variables in your shell and run `npm run migrate:supabase`.
4. Delete `.env.migration` and rotate the secret key if it was exposed anywhere.

The migration reads `data/impasto.sqlite` without modifying it. You can override
the source with `IMPASTO_SQLITE_PATH`.

## Desktop launchers

After `.env.local` is configured, the launchers below can still start the local
Next.js app. Local and hosted instances now use the same Supabase account and
database; they no longer write to SQLite.

macOS:

- Double-click `openImpasto.command`

Windows:

- Double-click `openImpasto.cmd`

On first launch, the launcher downloads the required Node.js runtime into
`.runtime`, verifies it, installs app dependencies into `node_modules`, and
opens Impasto automatically. npm's cache is also kept under `.runtime`.
No global Node.js install or admin setup is required.

If macOS blocks the first launch, open `System Settings > Privacy & Security`, click `Open Anyway`, then launch it again.

On Windows, no extra permission step is usually needed.
