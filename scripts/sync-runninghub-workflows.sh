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

const styles = ["realistic", "anime_jp", "anime_kr"];
const settingKeys = [
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

const wf1Raw = config?.wf1?.createWorkflows;
if (!wf1Raw || typeof wf1Raw !== "object" || Array.isArray(wf1Raw)) {
  throw new Error("wf1.createWorkflows must be an object.");
}

const createWorkflows = {};
for (const style of Object.keys(wf1Raw)) {
  if (!styles.includes(style)) {
    throw new Error(`Unsupported WF1 style: ${style}.`);
  }
}

for (const style of styles) {
  const entry = wf1Raw[style] ?? {};
  if (typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`wf1.createWorkflows.${style} must be an object.`);
  }

  const workflowId = readString(`wf1.createWorkflows.${style}.workflowId`, entry.workflowId);
  const promptNodeId = readString(`wf1.createWorkflows.${style}.promptNodeId`, entry.promptNodeId);
  const checkpointNodeId = readString(
    `wf1.createWorkflows.${style}.checkpointNodeId`,
    entry.checkpointNodeId,
  );
  const checkpointFieldName = readString(
    `wf1.createWorkflows.${style}.checkpointFieldName`,
    entry.checkpointFieldName,
  );
  const ckptName = readString(`wf1.createWorkflows.${style}.ckptName`, entry.ckptName);

  const anySet = workflowId || promptNodeId || checkpointNodeId || checkpointFieldName || ckptName;
  if (anySet && (!workflowId || !promptNodeId)) {
    throw new Error(
      `wf1.createWorkflows.${style} must include workflowId and promptNodeId when configured.`,
    );
  }
  if ((checkpointFieldName || ckptName) && !checkpointNodeId) {
    throw new Error(
      `wf1.createWorkflows.${style} must include checkpointNodeId when checkpointFieldName or ckptName is configured.`,
    );
  }

  if (workflowId && promptNodeId) {
    createWorkflows[style] = {
      workflowId,
      promptNodeId,
      ...(checkpointNodeId ? { checkpointNodeId } : {}),
      ...(checkpointFieldName ? { checkpointFieldName } : {}),
      ...(ckptName ? { ckptName } : {}),
    };
  }
}

const wf2Raw = config?.wf2 ?? {};
if (typeof wf2Raw !== "object" || Array.isArray(wf2Raw)) {
  throw new Error("wf2 must be an object.");
}

const wf2 = {
  workflowId: readString("wf2.workflowId", wf2Raw.workflowId),
  loadImageNodeId: readString("wf2.loadImageNodeId", wf2Raw.loadImageNodeId),
  promptNodeId: readString("wf2.promptNodeId", wf2Raw.promptNodeId),
};
const wf2AnySet = wf2.workflowId || wf2.loadImageNodeId || wf2.promptNodeId;
if (wf2AnySet && (!wf2.workflowId || !wf2.loadImageNodeId || !wf2.promptNodeId)) {
  throw new Error("wf2 must include workflowId, loadImageNodeId, and promptNodeId when configured.");
}

const statements = [
  "BEGIN TRANSACTION;",
  `DELETE FROM app_settings WHERE key IN (${settingKeys.map(sqlString).join(", ")});`,
];

if (Object.keys(createWorkflows).length > 0) {
  statements.push(upsert("image_gen.create_workflows", JSON.stringify(createWorkflows)));
}

if (wf2.workflowId && wf2.loadImageNodeId && wf2.promptNodeId) {
  statements.push(upsert("image_gen.wf2_workflow_id", wf2.workflowId));
  statements.push(upsert("image_gen.wf2_load_image_node_id", wf2.loadImageNodeId));
  statements.push(upsert("image_gen.wf2_prompt_node_id", wf2.promptNodeId));
}

statements.push("COMMIT;");

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
