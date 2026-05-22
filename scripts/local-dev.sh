#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$REPO_ROOT/tmp"
LOG_FILE="$LOG_DIR/local-dev.log"
PORTS=(8081 8787)

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

echo "Restarting local dev environment..."
echo "Using .env.dev for local environment values."
echo "Writing logs to $LOG_FILE"

if [ ! -f "$REPO_ROOT/.env.dev" ]; then
    echo "Warning: .env.dev was not found. Create it from .env.example if local keys are needed."
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
        echo "[$label] $line"
        printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$label" "$line" >> "$LOG_FILE"
    done
}

start_proc() {
    local label="$1"; shift
    ( "$@" 2>&1 | write_prefixed "$label" ) &
    echo $!
}

stop_proc() {
    local pid="$1"
    [ -n "$pid" ] || return 0
    kill -TERM "$pid" 2>/dev/null || true
    # Reap the whole process group too (pnpm spawns nested children)
    kill -TERM -"$pid" 2>/dev/null || true
}

cleanup() {
    echo ""
    echo "Stopping local dev services..."
    for pid in "${CHILDREN[@]:-}"; do
        stop_proc "$pid"
    done
    stop_ports
    exit 0
}

stop_ports

CHILDREN=()
CHILDREN+=("$(start_proc api pnpm run dev:api)")
CHILDREN+=("$(start_proc app pnpm run dev:app)")

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
echo "[local-dev] a child process exited (code $EXIT_CODE), stopping the other..."
for pid in "${CHILDREN[@]}"; do
    stop_proc "$pid"
done
stop_ports
exit "$EXIT_CODE"
