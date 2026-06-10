#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-4310}"
APP_URL="http://127.0.0.1:${PORT}"

cd "$SCRIPT_DIR"

mkdir -p data

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found on this Mac."
  echo "Opening the official Node.js download page..."
  open "https://nodejs.org/en/download"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found on this Mac."
  echo "Opening the official Node.js download page..."
  open "https://nodejs.org/en/download"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Impasto requires Node.js 24+."
  echo "Current Node.js version: $(node -v)"
  echo "Opening the official Node.js download page..."
  open "https://nodejs.org/en/download"
  exit 1
fi

if [ ! -d "node_modules" ] || [ ! -d "node_modules/lucide-react" ]; then
  echo "Installing dependencies from package-lock.json..."
  npm ci
fi

echo "Starting Impasto..."
npm run dev -- -p "$PORT" &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

READY=0
for _ in $(seq 1 80); do
  if curl -fsS "$APP_URL" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" -eq 1 ]; then
  open "$APP_URL"
else
  echo "Impasto is still starting. Open $APP_URL manually in your browser."
fi

echo "Keep this terminal open while using Impasto."
wait "$SERVER_PID"
