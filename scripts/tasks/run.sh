#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

usage() {
    cat >&2 <<EOF
Usage: $0 <task>
Available tasks:
  api:cf-types
  api:d1-migrate-dev
  api:d1-migrate-local
  api:d1-migrate-prod
  api:deploy-dev
  api:deploy-prod
  api:local
  api:sync-runninghub-dev
  api:sync-runninghub-prod
  api:typecheck
  app:export-web-dev
  app:export-web-prod
  app:local
  deploy:web-dev
  deploy:web-prod
  media:upload-official-dev
  media:upload-official-prod
EOF
    exit 1
}

task="${1:-}"
if [ -z "$task" ]; then
    usage
fi

# Load KEY=value pairs from an env file into the current shell, stripping
# surrounding single/double quotes. Missing file is a no-op.
load_env_file() {
    local file="$1"
    [ -f "$file" ] || return 0

    set -a
    while IFS= read -r raw || [ -n "$raw" ]; do
        local line="${raw#"${raw%%[![:space:]]*}"}"
        case "$line" in
            ""|"#"*) continue ;;
        esac

        local key="${line%%=*}"
        local value="${line#*=}"
        key="${key%"${key##*[![:space:]]}"}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"

        # strip a single layer of matching quotes
        if [[ "$value" == \"*\" && "${value:0:1}" == "\"" ]] && [[ "${value: -1}" == "\"" ]]; then
            value="${value:1:-1}"
        elif [[ "$value" == \'*\' && "${value:0:1}" == "'" ]] && [[ "${value: -1}" == "'" ]]; then
            value="${value:1:-1}"
        fi

        printf -v "$key" '%s' "$value"
        export "$key"
    done < "$file"
    set +a
}

run_in() {
    local subdir="$1"
    shift
    ( cd "$REPO_ROOT/$subdir" && "$@" )
}

WRANGLER_CFG="../../infra/cloudflare/wrangler.jsonc"

task_api_cf_types() {
    load_env_file "$REPO_ROOT/.env.local"
    run_in "packages/api" npx wrangler types --config "$WRANGLER_CFG" src/worker-configuration.d.ts
}

task_api_d1_migrate_dev() {
    load_env_file "$REPO_ROOT/.env.dev"
    run_in "packages/api" npx wrangler d1 migrations apply xtbit-apps-dev --remote --config "$WRANGLER_CFG"
}

task_api_d1_migrate_local() {
    load_env_file "$REPO_ROOT/.env.local"
    run_in "packages/api" npx wrangler d1 migrations apply xtbit-apps-dev --local --config "$WRANGLER_CFG"
}

task_api_d1_migrate_prod() {
    load_env_file "$REPO_ROOT/.env.prod"
    run_in "packages/api" npx wrangler d1 migrations apply xtbit-apps-prod --remote --config "$WRANGLER_CFG"
}

task_api_deploy_dev() {
    load_env_file "$REPO_ROOT/.env.dev"
    run_in "packages/api" npx wrangler deploy --config "$WRANGLER_CFG" --env=
}

task_api_deploy_prod() {
    load_env_file "$REPO_ROOT/.env.prod"
    run_in "packages/api" npx wrangler deploy --config "$WRANGLER_CFG" --env prod
}

task_api_sync_runninghub_dev() {
    run_in "." bash ./scripts/sync-runninghub-workflows.sh dev
}

task_api_sync_runninghub_prod() {
    run_in "." bash ./scripts/sync-runninghub-workflows.sh prod
}

task_media_upload_official_dev() {
    load_env_file "$REPO_ROOT/.env.dev"
    run_in "." bash ./scripts/upload-official-media.sh dev
}

task_media_upload_official_prod() {
    load_env_file "$REPO_ROOT/.env.prod"
    run_in "." bash ./scripts/upload-official-media.sh prod
}

task_api_local() {
    load_env_file "$REPO_ROOT/.env.local"
    run_in "packages/api" npx wrangler dev --config "$WRANGLER_CFG"
}

task_api_typecheck() {
    task_api_cf_types
    run_in "packages/api" npx tsc --noEmit
}

task_app_export_web_dev() {
    load_env_file "$REPO_ROOT/.env.dev"
    export EXPO_PUBLIC_API_URL="https://dev.aiappsbox.com/api"
    run_in "apps/app" npx expo export --platform web
}

task_app_export_web_prod() {
    load_env_file "$REPO_ROOT/.env.prod"
    export EXPO_PUBLIC_API_URL="https://aiappsbox.com/api"
    run_in "apps/app" npx expo export --platform web
}

task_app_local() {
    load_env_file "$REPO_ROOT/.env.local"
    export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://dev.aiappsbox.com/api}"
    run_in "apps/app" npx expo start --web
}

task_deploy_web_dev() {
    task_app_export_web_dev
    run_in "." npx wrangler pages deploy apps/app/dist \
        --project-name xtbit-apps \
        --branch dev \
        --commit-dirty=true \
        --commit-hash local-dev \
        --commit-message "dev web deploy"
}

task_deploy_web_prod() {
    task_app_export_web_prod
    run_in "." npx wrangler pages deploy apps/app/dist \
        --project-name xtbit-apps \
        --branch main \
        --commit-dirty=true \
        --commit-hash local-prod \
        --commit-message "prod web deploy"
}

case "$task" in
    api:cf-types)         task_api_cf_types ;;
    api:d1-migrate-dev)   task_api_d1_migrate_dev ;;
    api:d1-migrate-local) task_api_d1_migrate_local ;;
    api:d1-migrate-prod)  task_api_d1_migrate_prod ;;
    api:deploy-dev)       task_api_deploy_dev ;;
    api:deploy-prod)      task_api_deploy_prod ;;
    api:local)            task_api_local ;;
    api:sync-runninghub-dev)  task_api_sync_runninghub_dev ;;
    api:sync-runninghub-prod) task_api_sync_runninghub_prod ;;
    api:typecheck)        task_api_typecheck ;;
    app:export-web-dev)   task_app_export_web_dev ;;
    app:export-web-prod)  task_app_export_web_prod ;;
    app:local)            task_app_local ;;
    deploy:web-dev)       task_deploy_web_dev ;;
    deploy:web-prod)      task_deploy_web_prod ;;
    media:upload-official-dev)  task_media_upload_official_dev ;;
    media:upload-official-prod) task_media_upload_official_prod ;;
    *)
        echo "Unknown task '$task'." >&2
        usage
        ;;
esac
