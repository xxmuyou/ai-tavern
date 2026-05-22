#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

SECRETS_FILE="$REPO_ROOT/tmp/cloudflare-dev-secrets.env"
CONFIG_FILE="$REPO_ROOT/infra/cloudflare/wrangler.jsonc"

# Allowlist mirrors the previous .mjs implementation. Add new keys here
# explicitly to keep "what gets pushed to Cloudflare" auditable.
ALLOWED_SECRETS=(
    AUTH_TOKEN_SECRET
    STRIPE_PUBLISHABLE_KEY
    STRIPE_PRICE_PRO_MONTHLY
    STRIPE_SECRET_KEY
    STRIPE_WEBHOOK_SECRET
    OPENAI_API_KEY
    DEEPSEEK_API_KEY
    ARK_API_KEY
)

while [ $# -gt 0 ]; do
    case "$1" in
        --secrets-file)
            SECRETS_FILE="$2"; shift 2 ;;
        --secrets-file=*)
            SECRETS_FILE="${1#*=}"; shift ;;
        --config)
            CONFIG_FILE="$2"; shift 2 ;;
        --config=*)
            CONFIG_FILE="${1#*=}"; shift ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 1 ;;
    esac
done

[ -f "$SECRETS_FILE" ] || { echo "Secrets file not found: $SECRETS_FILE" >&2; exit 1; }
[ -f "$CONFIG_FILE" ]  || { echo "Wrangler config not found: $CONFIG_FILE" >&2; exit 1; }

echo "Reading Cloudflare dev secrets from $SECRETS_FILE"
echo "Using Wrangler config $CONFIG_FILE"

is_allowed() {
    local needle="$1"
    for k in "${ALLOWED_SECRETS[@]}"; do
        [ "$k" = "$needle" ] && return 0
    done
    return 1
}

while IFS= read -r raw || [ -n "$raw" ]; do
    line="${raw#"${raw%%[![:space:]]*}"}"
    case "$line" in
        ""|"#"*) continue ;;
    esac

    sep="${line%%=*}"
    [ "$sep" = "$line" ] && { echo "Invalid line (expected KEY=value): $line" >&2; exit 1; }

    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if ! is_allowed "$key"; then
        echo "Secret '$key' is not in the allowlist: ${ALLOWED_SECRETS[*]}" >&2
        exit 1
    fi

    if [ -z "$value" ]; then
        echo "Skipping empty secret $key"
        continue
    fi

    echo "Uploading $key to Cloudflare dev Worker..."
    printf '%s\n' "$value" | npx wrangler secret put "$key" --config "$CONFIG_FILE" --env=
done < "$SECRETS_FILE"

echo "Done. Delete or clear $SECRETS_FILE when you no longer need the local copy."
