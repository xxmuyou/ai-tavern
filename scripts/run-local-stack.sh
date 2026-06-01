#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$REPO_ROOT/tmp"
LOG_FILE="$LOG_DIR/local.log"
PORTS=(8081 8787)

SKIP_MIGRATE=0
for arg in "$@"; do
    case "$arg" in
        --skip-migrate) SKIP_MIGRATE=1 ;;
        -h|--help)
            cat <<'USAGE'
Usage: scripts/run-local-stack.sh [--skip-migrate]

Starts the Cloudflare Workers API on :8787 and the Expo web app on :8081.
By default applies any pending local D1 migrations before booting the API
so the worker never starts against a stale schema.

Options:
  --skip-migrate   Skip the D1 migration step (faster restart when schema
                   is known to be current).
USAGE
            exit 0 ;;
    esac
done

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

echo "Restarting local environment..."
echo "Using .env.local for local environment values."
echo "Writing logs to $LOG_FILE"

if [ ! -f "$REPO_ROOT/.env.local" ]; then
    echo "Warning: .env.local was not found. Create it from .env.example if local keys are needed."
fi

stop_ports() {
    if ! command -v lsof >/dev/null 2>&1; then
        return 0
    fi
    for port in "${PORTS[@]}"; do
        local pids
        pids="$(lsof -ti "tcp:$port" 2>/dev/null || true)"
        for pid in $pids; do
            if [ -n "$pid" ] && [ "$pid" -ne "$$" ]; then
                kill -TERM "$pid" 2>/dev/null || true
            fi
        done
    done
}

write_prefixed() {
    local label="$1"
    local line
    while IFS= read -r line; do
        [ -n "$line" ] || continue
        echo "[$label] $line" >&2
        printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$label" "$line" >> "$LOG_FILE"
    done
}

start_proc() {
    local label="$1"; shift
    ( unset NO_COLOR; "$@" 2>&1 | write_prefixed "$label" ) &
    STARTED_PID="$!"
}

stop_proc() {
    local pid="$1"
    [ -n "$pid" ] || return 0
    kill -TERM "$pid" 2>/dev/null || true
    # Reap the whole process group too (pnpm spawns nested children)
    kill -TERM -"$pid" 2>/dev/null || true
}

CLEANED_UP=0

cleanup() {
    trap - INT TERM
    if [ "$CLEANED_UP" -eq 1 ]; then
        exit 0
    fi
    CLEANED_UP=1
    echo ""
    echo "Stopping local dev services..."
    for pid in "${CHILDREN[@]:-}"; do
        stop_proc "$pid"
    done
    stop_ports
    exit 0
}

stop_ports

echo "Preparing local env files..."
if ! bash "$SCRIPT_DIR/generate-env-files.sh" local; then
    echo "Local env preparation failed. Refusing to start with stale env files." >&2
    exit 1
fi

if [ "$SKIP_MIGRATE" -eq 1 ]; then
    echo "Skipping D1 migration (--skip-migrate)."
else
    echo "Applying pending D1 migrations (local)..."
    if ! bash "$SCRIPT_DIR/tasks/run.sh" api:d1-migrate-local; then
        echo "D1 migration failed. Refusing to start with a stale schema." >&2
        echo "Re-run after fixing the migration, or pass --skip-migrate to bypass." >&2
        exit 1
    fi
fi

CHILDREN=()
start_proc api pnpm run run:local:api
CHILDREN+=("$STARTED_PID")
start_proc app pnpm run run:local:app
CHILDREN+=("$STARTED_PID")

trap cleanup INT TERM

echo ""
echo "Local dev services are starting:"
echo "  API: http://127.0.0.1:8787"
echo "  Web: http://localhost:8081"
echo ""
echo "Keep this terminal open. Press Ctrl+C in this terminal to stop both services."

# Wait for any child to exit, then cleanup.
wait -n "${CHILDREN[@]}" 2>/dev/null || true
EXIT_CODE=$?
echo "[run-local-stack] a child process exited (code $EXIT_CODE), stopping the other..."
for pid in "${CHILDREN[@]}"; do
    stop_proc "$pid"
done
stop_ports
exit "$EXIT_CODE"
