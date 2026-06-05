#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    cat >&2 <<EOF
Usage: $0 <dev|prod> [--dry-run]

Uploads repo-bundled official companion media to the environment R2 bucket
using the same object keys stored in seed data, e.g. portraits/aiko/neutral.webp.
EOF
    exit 1
}

target="${1:-}"
[ "$target" = "dev" ] || [ "$target" = "prod" ] || usage
shift

dry_run=0
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run)
            dry_run=1
            shift
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage
            ;;
    esac
done

case "$target" in
    dev)
        bucket="xtbit-apps-dev-assets"
        database="xtbit-apps-dev"
        ;;
    prod)
        bucket="xtbit-apps-prod-assets"
        database="xtbit-apps-prod"
        ;;
esac

media_root="$REPO_ROOT/apps/app/assets/ai-companion"
[ -d "$media_root" ] || { echo "Media root not found: $media_root" >&2; exit 1; }

content_type_for() {
    case "${1##*.}" in
        png) echo "image/png" ;;
        jpg|jpeg) echo "image/jpeg" ;;
        webp) echo "image/webp" ;;
        *) echo "application/octet-stream" ;;
    esac
}

sql_string() {
    local value="$1"
    value="${value//\'/\'\'}"
    printf "'%s'" "$value"
}

sql_tmp="$(mktemp)"
trap 'rm -f "$sql_tmp"' EXIT

count=0
while IFS= read -r file; do
    rel="${file#$media_root/}"
    key="$rel"
    size="$(wc -c < "$file" | tr -d '[:space:]')"
    content_type="$(content_type_for "$file")"
    count=$((count + 1))

    if [ "$dry_run" -eq 1 ]; then
        printf '%s\t%s\t%s bytes\n' "$key" "$content_type" "$size"
        continue
    fi

    npx wrangler r2 object put "$bucket/$key" \
        --file "$file" \
        --content-type "$content_type"

    {
        printf "INSERT OR REPLACE INTO asset_objects (key, content_type, size_bytes) VALUES (%s, %s, %s);\n" \
            "$(sql_string "$key")" \
            "$(sql_string "$content_type")" \
            "$size"
    } >> "$sql_tmp"
done < <(find "$media_root/portraits" "$media_root/scenes" -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.webp' \) | sort)

if [ "$dry_run" -eq 1 ]; then
    echo "Dry run: $count official media objects would be uploaded to $bucket."
    exit 0
fi

if [ "$count" -gt 0 ]; then
    npx wrangler d1 execute "$database" --remote --file "$sql_tmp"
fi

echo "Uploaded $count official media objects to $bucket and synced asset_objects."
