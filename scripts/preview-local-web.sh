#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${PORT:-19006}"
API_URL="http://127.0.0.1:8787"

echo "Exporting web bundle for local API: $API_URL"
EXPO_PUBLIC_API_URL="$API_URL" bash "$REPO_ROOT/scripts/tasks/run.sh" app:export-web-local

if command -v lsof >/dev/null 2>&1 && lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
    echo "Port $PORT is already in use." >&2
    echo "Stop the existing preview server, or run: PORT=19007 pnpm preview:web:local" >&2
    exit 1
fi

if ! curl -fsS "$API_URL/health" >/dev/null 2>&1; then
    echo "Warning: local API is not reachable at $API_URL."
    echo "Start it with: pnpm run:local:api"
    echo "Discover will show the local API unavailable state until the API is running."
fi

echo "Serving apps/app/dist at http://127.0.0.1:$PORT"
echo "This static preview still expects the local API at $API_URL."
cd "$REPO_ROOT"
python3 -m http.server "$PORT" --directory apps/app/dist
