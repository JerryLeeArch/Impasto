#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-4310}"
APP_URL="http://127.0.0.1:${PORT}"
RUNTIME_ROOT="$SCRIPT_DIR/.runtime"
DOWNLOAD_ROOT="$RUNTIME_ROOT/downloads"

cd "$SCRIPT_DIR"

mkdir -p data
mkdir -p "$RUNTIME_ROOT"

get_node_version() {
  if [ -f ".node-version" ]; then
    NODE_VERSION="$(tr -d '[:space:]' < .node-version)"
  else
    NODE_VERSION="25.6.1"
  fi

  if [ -z "$NODE_VERSION" ]; then
    echo ".node-version is empty."
    exit 1
  fi

  case "$NODE_VERSION" in
    v*) ;;
    *) NODE_VERSION="v$NODE_VERSION" ;;
  esac
}

get_node_arch() {
  case "$(uname -m)" in
    arm64|aarch64) NODE_ARCH="arm64" ;;
    x86_64|amd64) NODE_ARCH="x64" ;;
    *)
      echo "Unsupported Mac CPU architecture: $(uname -m)"
      exit 1
      ;;
  esac
}

expected_hash() {
  local shasums_file="$1"
  local file_name="$2"

  awk -v file_name="$file_name" '$2 == file_name { print tolower($1); found = 1 } END { if (!found) exit 1 }' "$shasums_file"
}

file_hash_matches() {
  local file_path="$1"
  local expected="$2"

  if [ ! -f "$file_path" ]; then
    return 1
  fi

  local actual
  actual="$(shasum -a 256 "$file_path" | awk '{ print tolower($1) }')"
  [ "$actual" = "$expected" ]
}

ensure_node_runtime() {
  get_node_version
  get_node_arch

  NODE_FOLDER="node-${NODE_VERSION}-darwin-${NODE_ARCH}"
  NODE_ROOT="$RUNTIME_ROOT/$NODE_FOLDER"
  NODE_BIN="$NODE_ROOT/bin/node"
  NPM_BIN="$NODE_ROOT/bin/npm"

  if [ -x "$NODE_BIN" ] && [ -x "$NPM_BIN" ]; then
    INSTALLED_VERSION="$("$NODE_BIN" -p "process.version" 2>/dev/null || true)"
    if [ "$INSTALLED_VERSION" = "$NODE_VERSION" ]; then
      echo "Using local Node.js $INSTALLED_VERSION ($NODE_ARCH)."
      return
    fi

    echo "Replacing mismatched local Node.js runtime..."
    rm -rf "$NODE_ROOT"
  fi

  echo "Preparing local Node.js $NODE_VERSION ($NODE_ARCH)..."
  mkdir -p "$DOWNLOAD_ROOT"

  ARCHIVE_NAME="$NODE_FOLDER.tar.gz"
  ARCHIVE_PATH="$DOWNLOAD_ROOT/$ARCHIVE_NAME"
  SHASUMS_PATH="$DOWNLOAD_ROOT/${NODE_VERSION}-SHASUMS256.txt"
  BASE_URL="https://nodejs.org/dist/$NODE_VERSION"

  curl -fsSL "$BASE_URL/SHASUMS256.txt" -o "$SHASUMS_PATH"
  EXPECTED_HASH="$(expected_hash "$SHASUMS_PATH" "$ARCHIVE_NAME")"

  if ! file_hash_matches "$ARCHIVE_PATH" "$EXPECTED_HASH"; then
    rm -f "$ARCHIVE_PATH"
    curl -fsSL "$BASE_URL/$ARCHIVE_NAME" -o "$ARCHIVE_PATH"

    if ! file_hash_matches "$ARCHIVE_PATH" "$EXPECTED_HASH"; then
      echo "Downloaded Node.js archive failed SHA256 verification."
      exit 1
    fi
  else
    echo "Using cached $ARCHIVE_NAME."
  fi

  rm -rf "$NODE_ROOT"
  tar -xzf "$ARCHIVE_PATH" -C "$RUNTIME_ROOT"

  if [ ! -x "$NODE_BIN" ] || [ ! -x "$NPM_BIN" ]; then
    echo "Node.js archive extracted, but node or npm was not found."
    exit 1
  fi

  INSTALLED_VERSION="$("$NODE_BIN" -p "process.version")"
  if [ "$INSTALLED_VERSION" != "$NODE_VERSION" ]; then
    echo "Expected Node.js $NODE_VERSION, but extracted $INSTALLED_VERSION."
    exit 1
  fi

  echo "Installed local Node.js $INSTALLED_VERSION."
}

ensure_node_runtime

export PATH="$NODE_ROOT/bin:$PATH"
export NPM_CONFIG_CACHE="$RUNTIME_ROOT/npm-cache"
export NPM_CONFIG_UPDATE_NOTIFIER=false
export NEXT_TELEMETRY_DISABLED=1

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
