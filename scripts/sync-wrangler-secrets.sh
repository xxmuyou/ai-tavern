#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    cat >&2 <<EOF
Usage: $0 <dev|prod> [--dry-run] [--config <path>]

Uploads Worker runtime secrets from .env.dev or .env.prod to Cloudflare
Wrangler for the selected environment.

This intentionally does not upload deployment credentials, frontend public
variables, or backup-only AWS variables.
EOF
    exit 1
}

target="${1:-}"
[ "$target" = "dev" ] || [ "$target" = "prod" ] || usage
shift

dry_run=0
config_file="$REPO_ROOT/infra/cloudflare/wrangler.jsonc"

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run)
            dry_run=1
            shift
            ;;
        --config)
            [ $# -ge 2 ] || usage
            config_file="$2"
            shift 2
            ;;
        --config=*)
            config_file="${1#*=}"
            shift
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage
            ;;
    esac
done

env_file="$REPO_ROOT/.env.$target"
[ -f "$env_file" ] || { echo "Env file not found: $env_file" >&2; exit 1; }
[ -f "$config_file" ] || { echo "Wrangler config not found: $config_file" >&2; exit 1; }

if [ "$target" = "prod" ]; then
    wrangler_env_args=(--env production)
else
    wrangler_env_args=(--env=)
fi

# Only keys that the Worker should receive at runtime belong here.
# Do not add CLOUDFLARE_*, AWS_*, or EXPO_PUBLIC_* values.
ALLOWED_SECRET_KEYS=(
    AUTH_TOKEN_SECRET
    JWT_SIGNING_KEY
    GOOGLE_OAUTH_CLIENT_SECRET
    EMAIL_PROVIDER_API_KEY
    EMAIL_FROM_ADDRESS
    APPLE_SIGNIN_PRIVATE_KEY
    STRIPE_PRICE_PRO_MONTHLY
    STRIPE_SECRET_KEY
    STRIPE_WEBHOOK_SECRET
    OPENAI_API_KEY
    OPENAI_MODEL
    DEEPSEEK_API_KEY
    ARK_API_KEY
    LLM_DEFAULT_ROUTE
)

is_allowed_secret() {
    local needle="$1"
    local allowed_key
    for allowed_key in "${ALLOWED_SECRET_KEYS[@]}"; do
        [ "$allowed_key" = "$needle" ] && return 0
    done
    return 1
}

strip_matching_quotes() {
    local value="$1"
    if [[ "$value" == \"*\" && "${value: -1}" == "\"" ]]; then
        value="${value:1:-1}"
    elif [[ "$value" == \'*\' && "${value: -1}" == "'" ]]; then
        value="${value:1:-1}"
    fi
    printf '%s' "$value"
}

echo "Reading $env_file"
echo "Using Wrangler config $config_file"
echo "Target environment: $target"

while IFS= read -r raw || [ -n "$raw" ]; do
    line="${raw#"${raw%%[![:space:]]*}"}"
    line="${line#$'\xef\xbb\xbf'}"
    case "$line" in
        ""|"#"*) continue ;;
    esac

    if [ "${line#*=}" = "$line" ]; then
        echo "Invalid line (expected KEY=value): $line" >&2
        exit 1
    fi

    key="${line%%=*}"
    value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    value="$(strip_matching_quotes "$value")"

    case "$key" in
        CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN)
            printf -v "$key" '%s' "$value"
            export "$key"
            continue
            ;;
    esac

    if ! is_allowed_secret "$key"; then
        echo "Skipping $key (not a Worker runtime secret)"
        continue
    fi

    if [ -z "$value" ]; then
        echo "Skipping empty $key"
        continue
    fi

    if [ "$dry_run" -eq 1 ]; then
        echo "Would upload $key"
        continue
    fi

    echo "Uploading $key..."
    printf '%s\n' "$value" | npx wrangler secret put "$key" --config "$config_file" "${wrangler_env_args[@]}"
done < "$env_file"

if [ "$dry_run" -eq 1 ]; then
    echo "Dry run complete. No Cloudflare secrets were changed."
else
    echo "Done. Cloudflare Worker secrets for $target are updated."
fi
