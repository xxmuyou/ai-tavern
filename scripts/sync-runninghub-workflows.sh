#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    cat >&2 <<EOF
Usage: $0 <dev|prod> [--dry-run] [--config <path>]

Syncs repo-managed RunningHub workflow/checkpoint defaults into D1.
The config seeds checkpoint catalog rows, workflow rows, workflow/model bindings,
and a legacy image_gen.workflows setting for pre-migration fallback.
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

// RunningHub catalog seed (spec-022): checkpoint catalog + workflow catalog +
// workflow/model bindings. We also write image_gen.workflows as a fallback for
// pre-migration workers/tests; runtime should use image_workflows.
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

const checkpointsRaw = Array.isArray(config?.checkpoints) ? config.checkpoints : [];
const checkpoints = [];
for (const [index, entry] of checkpointsRaw.entries()) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`checkpoints[${index}] must be an object.`);
  }
  const id = readString(`checkpoints[${index}].id`, entry.id);
  const label = readString(`checkpoints[${index}].label`, entry.label);
  const ckptName = readString(`checkpoints[${index}].ckptName`, entry.ckptName);
  if (!id || !label || !ckptName) {
    throw new Error(`checkpoints[${index}] must include id, label, and ckptName.`);
  }
  const tags = Array.isArray(entry.tags)
    ? entry.tags.map((tag) => readString(`checkpoints[${index}].tags[]`, tag)).filter(Boolean)
    : [];
  checkpoints.push({
    ckptName,
    id,
    isActive: entry.isActive === undefined ? true : Boolean(entry.isActive),
    label,
    sortOrder: Number.isFinite(entry.sortOrder) ? Number(entry.sortOrder) : index + 1,
    tag: tags.join(","),
  });
}

const workflows = {};
const workflowRows = [];
const bindings = [];
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
  const promptFieldName =
    readString(`workflows.${key}.promptFieldName`, entry.promptFieldName) || "text";
  const checkpointNodeId = readString(`workflows.${key}.checkpointNodeId`, entry.checkpointNodeId);
  const checkpointFieldName =
    readString(`workflows.${key}.checkpointFieldName`, entry.checkpointFieldName) || "ckpt_name";
  const loadImageNodeId = readString(`workflows.${key}.loadImageNodeId`, entry.loadImageNodeId);
  const negativePromptNodeId =
    readString(`workflows.${key}.negativePromptNodeId`, entry.negativePromptNodeId);
  const negativePromptFieldName =
    readString(`workflows.${key}.negativePromptFieldName`, entry.negativePromptFieldName) || "prompt";
  const label = readString(`workflows.${key}.label`, entry.label) || key;
  const modelIds = Array.isArray(entry.modelIds)
    ? entry.modelIds.map((id) => readString(`workflows.${key}.modelIds[]`, id)).filter(Boolean)
    : [];

  const anySet = workflowId || promptNodeId || checkpointNodeId || loadImageNodeId;
  if (anySet) {
    if (!workflowId || !promptNodeId) {
      throw new Error(`workflows.${key} must include workflowId and promptNodeId when configured.`);
    }
    if (mode === "variation" && !loadImageNodeId) {
      throw new Error(`workflows.${key} (variation) must include loadImageNodeId when configured.`);
    }
  }

  workflows[key] = {
    label,
    mode,
    workflowId,
    promptNodeId,
    promptFieldName,
    ...(checkpointNodeId ? { checkpointNodeId } : {}),
    ...(checkpointFieldName ? { checkpointFieldName } : {}),
    ...(loadImageNodeId ? { loadImageNodeId } : {}),
    ...(negativePromptNodeId ? { negativePromptNodeId } : {}),
    ...(negativePromptFieldName ? { negativePromptFieldName } : {}),
    ...(modelIds.length ? { modelIds } : {}),
  };
  workflowRows.push({
    checkpointFieldName,
    checkpointNodeId,
    isActive: entry.isActive === undefined ? true : Boolean(entry.isActive),
    key,
    label,
    loadImageNodeId,
    mode,
    negativePromptFieldName,
    negativePromptNodeId,
    promptFieldName,
    promptNodeId,
    sortOrder: Number.isFinite(entry.sortOrder) ? Number(entry.sortOrder) : workflowRows.length + 1,
    workflowId,
  });
  for (const [index, modelId] of modelIds.entries()) {
    bindings.push({ modelId, sortOrder: index + 1, workflowKey: key });
  }
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

for (const checkpoint of checkpoints) {
  statements.push([
    "INSERT INTO image_models (id, label, tag, ckpt_name, is_active, sort_order, updated_at, updated_by)",
    `VALUES (${sqlString(checkpoint.id)}, ${sqlString(checkpoint.label)}, ${sqlString(checkpoint.tag)}, ${sqlString(checkpoint.ckptName)}, ${checkpoint.isActive ? 1 : 0}, ${checkpoint.sortOrder}, ${now}, NULL)`,
    "ON CONFLICT(id) DO UPDATE SET",
    "  label = excluded.label,",
    "  tag = excluded.tag,",
    "  ckpt_name = excluded.ckpt_name,",
    "  is_active = excluded.is_active,",
    "  sort_order = excluded.sort_order,",
    "  updated_at = excluded.updated_at,",
    "  updated_by = excluded.updated_by;",
  ].join("\n"));
}

for (const workflow of workflowRows) {
  statements.push([
    "INSERT INTO image_workflows",
    "  (key, label, mode, workflow_id, prompt_node_id, prompt_field_name, checkpoint_node_id, checkpoint_field_name, load_image_node_id, negative_prompt_node_id, negative_prompt_field_name, is_active, sort_order, updated_at, updated_by)",
    `VALUES (${sqlString(workflow.key)}, ${sqlString(workflow.label)}, ${sqlString(workflow.mode)}, ${sqlString(workflow.workflowId)}, ${sqlString(workflow.promptNodeId)}, ${sqlString(workflow.promptFieldName)}, ${workflow.checkpointNodeId ? sqlString(workflow.checkpointNodeId) : "NULL"}, ${sqlString(workflow.checkpointFieldName)}, ${workflow.loadImageNodeId ? sqlString(workflow.loadImageNodeId) : "NULL"}, ${workflow.negativePromptNodeId ? sqlString(workflow.negativePromptNodeId) : "NULL"}, ${sqlString(workflow.negativePromptFieldName)}, ${workflow.isActive ? 1 : 0}, ${workflow.sortOrder}, ${now}, NULL)`,
    "ON CONFLICT(key) DO UPDATE SET",
    "  label = excluded.label,",
    "  mode = excluded.mode,",
    "  workflow_id = excluded.workflow_id,",
    "  prompt_node_id = excluded.prompt_node_id,",
    "  prompt_field_name = excluded.prompt_field_name,",
    "  checkpoint_node_id = excluded.checkpoint_node_id,",
    "  checkpoint_field_name = excluded.checkpoint_field_name,",
    "  load_image_node_id = excluded.load_image_node_id,",
    "  negative_prompt_node_id = excluded.negative_prompt_node_id,",
    "  negative_prompt_field_name = excluded.negative_prompt_field_name,",
    "  is_active = excluded.is_active,",
    "  sort_order = excluded.sort_order,",
    "  updated_at = excluded.updated_at,",
    "  updated_by = excluded.updated_by;",
  ].join("\n"));
  statements.push(`DELETE FROM image_workflow_models WHERE workflow_key = ${sqlString(workflow.key)};`);
}

for (const binding of bindings) {
  statements.push([
    "INSERT INTO image_workflow_models (workflow_key, model_id, is_active, sort_order, updated_at, updated_by)",
    `VALUES (${sqlString(binding.workflowKey)}, ${sqlString(binding.modelId)}, 1, ${binding.sortOrder}, ${now}, NULL)`,
    "ON CONFLICT(workflow_key, model_id) DO UPDATE SET",
    "  is_active = excluded.is_active,",
    "  sort_order = excluded.sort_order,",
    "  updated_at = excluded.updated_at,",
    "  updated_by = excluded.updated_by;",
  ].join("\n"));
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
