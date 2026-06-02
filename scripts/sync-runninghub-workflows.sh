#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    cat >&2 <<EOF
Usage: $0 <dev|prod> [--dry-run] [--config <path>]

Syncs repo-managed RunningHub workflow/checkpoint config into D1 app_settings.
The sync is deployment-managed: repo config overwrites admin drift.
EOF
    exit 1
}

target="${1:-}"
[ "$target" = "dev" ] || [ "$target" = "prod" ] || usage
shift

dry_run=0
config_file="$REPO_ROOT/config/runninghub-workflows.$target.json"
wrangler_config="$REPO_ROOT/infra/cloudflare/wrangler.jsonc"

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
[ -f "$config_file" ] || { echo "RunningHub config not found: $config_file" >&2; exit 1; }
[ -f "$wrangler_config" ] || { echo "Wrangler config not found: $wrangler_config" >&2; exit 1; }

load_env_file() {
    local file="$1"
    [ -f "$file" ] || return 0

    set -a
    while IFS= read -r raw || [ -n "$raw" ]; do
        local line="${raw#"${raw%%[![:space:]]*}"}"
        line="${line#$'\xef\xbb\xbf'}"
        case "$line" in
            ""|"#"*) continue ;;
        esac

        if [ "${line#*=}" = "$line" ]; then
            echo "Invalid line (expected KEY=value): $line" >&2
            exit 1
        fi

        local key="${line%%=*}"
        local value="${line#*=}"
        key="${key%"${key##*[![:space:]]}"}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"

        if [[ "$value" == \"*\" && "${value: -1}" == "\"" ]]; then
            value="${value:1:-1}"
        elif [[ "$value" == \'*\' && "${value: -1}" == "'" ]]; then
            value="${value:1:-1}"
        fi

        printf -v "$key" '%s' "$value"
        export "$key"
    done < "$file"
    set +a
}

case "$target" in
    dev) database_name="xtbit-apps-dev" ;;
    prod) database_name="xtbit-apps-prod" ;;
esac

sql_tmp="$(mktemp)"
trap 'rm -f "$sql_tmp"' EXIT

node - "$config_file" > "$sql_tmp" <<'NODE'
const fs = require("node:fs");

const configPath = process.argv[2];
if (!configPath) {
  console.error("Missing config path.");
  process.exit(1);
}

const raw = fs.readFileSync(configPath, "utf8");
const config = JSON.parse(raw);
const now = Date.now();

// Unified workflow wiring (spec-022, "workflow -> models"): a single JSON
// setting keyed by workflow key. Checkpoints live on the model catalog, not
// here. Legacy keys are removed so old admin/deploy drift is cleaned up.
const settingKeys = [
  "image_gen.workflows",
  "image_gen.create_workflows",
  "image_gen.wf2_workflow_id",
  "image_gen.wf2_load_image_node_id",
  "image_gen.wf2_prompt_node_id",
];

function readString(path, value) {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string.`);
  }
  return value.trim();
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function upsert(key, value) {
  return [
    "INSERT INTO app_settings (key, value, updated_at, updated_by)",
    `VALUES (${sqlString(key)}, ${sqlString(value)}, ${now}, NULL)`,
    "ON CONFLICT(key) DO UPDATE SET",
    "  value = excluded.value,",
    "  updated_at = excluded.updated_at,",
    "  updated_by = excluded.updated_by;",
  ].join("\n");
}

const workflowsRaw = config?.workflows;
if (!workflowsRaw || typeof workflowsRaw !== "object" || Array.isArray(workflowsRaw)) {
  throw new Error("config.workflows must be an object keyed by workflow key.");
}

const workflows = {};
for (const key of Object.keys(workflowsRaw)) {
  const entry = workflowsRaw[key] ?? {};
  if (typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`workflows.${key} must be an object.`);
  }

  const mode = readString(`workflows.${key}.mode`, entry.mode) || "create";
  if (mode !== "create" && mode !== "variation") {
    throw new Error(`workflows.${key}.mode must be "create" or "variation".`);
  }
  const workflowId = readString(`workflows.${key}.workflowId`, entry.workflowId);
  const promptNodeId = readString(`workflows.${key}.promptNodeId`, entry.promptNodeId);
  const checkpointNodeId = readString(`workflows.${key}.checkpointNodeId`, entry.checkpointNodeId);
  const loadImageNodeId = readString(`workflows.${key}.loadImageNodeId`, entry.loadImageNodeId);

  const anySet = workflowId || promptNodeId || checkpointNodeId || loadImageNodeId;
  if (!anySet) continue; // unconfigured placeholder — skip
  if (!workflowId || !promptNodeId) {
    throw new Error(`workflows.${key} must include workflowId and promptNodeId when configured.`);
  }
  if (mode === "variation" && !loadImageNodeId) {
    throw new Error(`workflows.${key} (variation) must include loadImageNodeId when configured.`);
  }

  workflows[key] = {
    mode,
    workflowId,
    promptNodeId,
    ...(checkpointNodeId ? { checkpointNodeId } : {}),
    ...(loadImageNodeId ? { loadImageNodeId } : {}),
  };
}

// D1 `wrangler d1 execute --remote --file` runs the file's statements as a
// single atomic batch and rejects explicit BEGIN TRANSACTION / COMMIT, so these
// statements must NOT be wrapped in an explicit transaction.
const statements = [
  `DELETE FROM app_settings WHERE key IN (${settingKeys.map(sqlString).join(", ")});`,
];

if (Object.keys(workflows).length > 0) {
  statements.push(upsert("image_gen.workflows", JSON.stringify(workflows)));
}

console.log(statements.join("\n\n"));
NODE

echo "RunningHub config: $config_file"
echo "D1 database: $database_name"

if [ "$dry_run" -eq 1 ]; then
    echo "Dry run SQL:"
    cat "$sql_tmp"
    exit 0
fi

load_env_file "$env_file"
npx wrangler d1 execute "$database_name" --remote --config "$wrangler_config" --file "$sql_tmp"
echo "Done. RunningHub workflow/checkpoint config synced to $target D1."
