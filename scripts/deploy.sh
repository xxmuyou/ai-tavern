#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    cat >&2 <<EOF
Usage: $0 <dev|prod> [--skip-checks]

Runs local verification, D1 migrations, API deploy, and web deploy for the
selected environment.
EOF
    exit 1
}

target="${1:-}"
skip_checks="${2:-}"

if [ "$target" != "dev" ] && [ "$target" != "prod" ]; then
    usage
fi

if [ -n "$skip_checks" ] && [ "$skip_checks" != "--skip-checks" ]; then
    usage
fi

cd "$REPO_ROOT"

assert_web_entry_matches() {
    local origin="$1"
    local expected
    local actual

    expected="$(node - <<'NODE'
const fs = require("fs");
const html = fs.readFileSync("apps/app/dist/index.html", "utf8");
const match = html.match(/\/_expo\/static\/js\/web\/entry-[^"']+\.js/);
if (!match) process.exit(1);
console.log(match[0]);
NODE
)"
    actual="$(curl -fsS "$origin" | node -e '
let html = "";
process.stdin.on("data", (chunk) => { html += chunk; });
process.stdin.on("end", () => {
  const match = html.match(/\/_expo\/static\/js\/web\/entry-[^"'"'"']+\.js/);
  if (!match) process.exit(1);
  console.log(match[0]);
});
')"

    if [ "$expected" != "$actual" ]; then
        echo "Web deploy verification failed for $origin" >&2
        echo "Expected entry: $expected" >&2
        echo "Actual entry:   $actual" >&2
        exit 1
    fi
}

if [ "$skip_checks" != "--skip-checks" ]; then
    pnpm typecheck
    pnpm test
fi

if [ "$target" = "prod" ]; then
    printf "Deploying to prod. Type 'prod' to continue: "
    read -r confirmation
    if [ "$confirmation" != "prod" ]; then
        echo "Deployment cancelled." >&2
        exit 1
    fi

    pnpm cf:d1:migrate:prod
    ./scripts/tasks/run.sh api:deploy-prod
    ./scripts/tasks/run.sh deploy:web-prod
    curl -fsS "https://aiappsbox.com/api/health" >/dev/null
    curl -fsSI "https://aiappsbox.com" >/dev/null
    assert_web_entry_matches "https://aiappsbox.com"
else
    pnpm cf:d1:migrate:dev
    pnpm deploy:api:dev
    pnpm deploy:web:dev
    curl -fsS "https://dev.aiappsbox.com/api/health" >/dev/null
    curl -fsSI "https://dev.aiappsbox.com" >/dev/null
    assert_web_entry_matches "https://dev.aiappsbox.com"
fi
