# Impasto

_A canvas for your evolving tastes._

## About

Impasto is a digital archive designed to record the continuous evolution of personal preference. Just as the impasto painting technique builds depth and texture through thick, expressive layers of paint, this project captures the shifting layers of your inspirations, choices, and identity over time.

## Environment

Create a `.env.local` with the following variables:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# Music metadata (server-side; album art + in-browser player + credits)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
GENIUS_ACCESS_TOKEN=
```

`SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` come from the [Spotify developer dashboard](https://developer.spotify.com/dashboard) (Web API, Client Credentials) and power album art + the embedded track player. `GENIUS_ACCESS_TOKEN` comes from [Genius API clients](https://genius.com/api-clients) and supplies song credits.
