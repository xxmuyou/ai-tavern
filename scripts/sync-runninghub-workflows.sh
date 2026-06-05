#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    cat >&2 <<EOF
Usage: $0 <dev|prod> [--dry-run] [--config <path>]

Syncs repo-managed RunningHub workflow contract/checkpoint defaults into D1.
The config seeds checkpoint catalog rows, workflow rows, workflow/model bindings,
contract metadata, and a legacy image_gen.workflows setting for fallback.
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

load_env_file "$env_file"

node - "$config_file" > "$sql_tmp" <<'NODE'
const fs = require("node:fs");
const { createHash } = require("node:crypto");

const configPath = process.argv[2];
if (!configPath) {
  console.error("Missing config path.");
  process.exit(1);
}

const raw = fs.readFileSync(configPath, "utf8");
const config = JSON.parse(raw);
const now = Date.now();
const runningHubApiKey = (process.env.RUNNINGHUB_API_KEY || "").trim();
const runningHubBaseUrl = (process.env.RUNNINGHUB_BASE_URL || "https://www.runninghub.ai").replace(/\/+$/, "");
const assetBaseArchitectures = new Set(["sdxl", "sd15", "ilxl", "flux1"]);
const workflowArchitectures = new Set([...assetBaseArchitectures, "none"]);

// RunningHub catalog seed (spec-022): checkpoint catalog + semantic workflow
// catalog + Anime/Realistic lane memberships. We also write image_gen.workflows
// as a fallback for pre-migration workers/tests; runtime should use
// image_workflows.
const settingKeys = [
  "image_gen.workflows",
  "image_gen.create_workflows",
];

function readString(path, value) {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string.`);
  }
  return value.trim();
}

function readNumber(path, value, fallback) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${path} must be a number.`);
  }
  return number;
}

function assertSemanticWorkflowKey(path, key) {
  if (/^wf\d*$/i.test(key) || /^wf_/i.test(key)) {
    throw new Error(`${path} must use a semantic key, not a numeric/legacy workflow key.`);
  }
}

function assertNoLegacyRegionToken(path, value) {
  const text = String(value || "");
  if (!text) return;
  if (/(^|[^a-z0-9])(jp|kr)([^a-z0-9]|$)|anime[_,-]?jp|anime[_,-]?kr/i.test(text)) {
    throw new Error(`${path} must not contain JP/KR or anime_jp/anime_kr style buckets.`);
  }
}

function normalizeLane(path, value, required = false) {
  const text = readString(path, value).toLowerCase();
  if (!text) {
    if (required) throw new Error(`${path} must be "anime" or "realistic".`);
    return "";
  }
  if (text !== "anime" && text !== "realistic") {
    throw new Error(`${path} must be "anime" or "realistic".`);
  }
  return text;
}

function normalizeLaneTags(path, value, required = false) {
  const raw = Array.isArray(value)
    ? value.map((tag) => readString(`${path}[]`, tag)).filter(Boolean)
    : readString(path, value).split(",").map((tag) => tag.trim()).filter(Boolean);
  if (required && raw.length === 0) {
    throw new Error(`${path} must include "anime" or "realistic".`);
  }
  const tags = [...new Set(raw.map((tag) => tag.toLowerCase()))];
  for (const [index, tag] of tags.entries()) {
    assertNoLegacyRegionToken(`${path}[${index}]`, tag);
    if (tag !== "anime" && tag !== "realistic") {
      throw new Error(`${path}[${index}] must be "anime" or "realistic".`);
    }
  }
  return tags;
}

function normalizeArchitecture(path, value, required = false, options = {}) {
  const allowed = options.workflow ? workflowArchitectures : assetBaseArchitectures;
  const text = readString(path, value).toLowerCase();
  if (!text) {
    if (required) throw new Error(`${path} must be one of: ${[...allowed].join(", ")}.`);
    return "";
  }
  if (!allowed.has(text)) {
    throw new Error(`${path} must be one of: ${[...allowed].join(", ")}.`);
  }
  return text;
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

function normalizeContractPrompt(prompt) {
  const parsed = typeof prompt === "string" ? JSON.parse(prompt) : prompt;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("workflow contract prompt must be a JSON object.");
  }
  const nodes = [];
  for (const [nodeId, rawNode] of Object.entries(parsed)) {
    if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) continue;
    const inputs = rawNode.inputs;
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) continue;
    const meta = rawNode._meta && typeof rawNode._meta === "object" && !Array.isArray(rawNode._meta)
      ? rawNode._meta
      : {};
    nodes.push({
      ...(typeof rawNode.class_type === "string" ? { class_type: rawNode.class_type } : {}),
      inputs: Object.keys(inputs).sort(),
      nodeId,
      ...(typeof meta.title === "string" ? { title: meta.title } : {}),
    });
  }
  nodes.sort((a, b) => nodeSortKey(a.nodeId).localeCompare(nodeSortKey(b.nodeId)));
  const contractJson = JSON.stringify({ nodes, version: 1 });
  const contractHash = createHash("sha256").update(contractJson).digest("hex");
  return { contractHash, contractJson };
}

function nodeSortKey(nodeId) {
  const numeric = Number(nodeId);
  return Number.isFinite(numeric) ? String(numeric).padStart(12, "0") : nodeId;
}

function parseContractJson(value) {
  if (!value) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const parsed = JSON.parse(text);
  if (parsed?.version !== 1 || !Array.isArray(parsed.nodes)) {
    throw new Error("contractJson must have shape { version: 1, nodes: [...] }.");
  }
  const contractHash = createHash("sha256").update(text).digest("hex");
  return { contractHash, contractJson: text };
}

async function fetchContract(workflowKey, workflowId) {
  if (!workflowId) return null;
  if (!runningHubApiKey) {
    console.error(`Warning: RUNNINGHUB_API_KEY not set; skipping contract refresh for workflows.${workflowKey}.`);
    return null;
  }
  const response = await fetch(`${runningHubBaseUrl}/api/openapi/getJsonApiFormat`, {
    body: JSON.stringify({ apiKey: runningHubApiKey, workflowId }),
    headers: {
      authorization: `Bearer ${runningHubApiKey}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.code !== 0) {
    throw new Error(
      `RunningHub getJsonApiFormat failed for workflows.${workflowKey}: ${json?.msg || `HTTP ${response.status}`}`,
    );
  }
  if (!json?.data?.prompt) {
    throw new Error(`RunningHub getJsonApiFormat for workflows.${workflowKey} did not return data.prompt.`);
  }
  return normalizeContractPrompt(json.data.prompt);
}

function contractHasField(contractJson, nodeId, fieldName) {
  if (!contractJson || !nodeId || !fieldName) return true;
  const contract = JSON.parse(contractJson);
  const node = contract.nodes.find((entry) => entry.nodeId === nodeId);
  return Boolean(node?.inputs?.includes(fieldName));
}

function validateContractField(contractJson, path, nodeId, fieldName) {
  if (!nodeId) return;
  if (!contractHasField(contractJson, nodeId, fieldName)) {
    throw new Error(`${path} references nodeId=${nodeId}, fieldName=${fieldName}, but that field is not in the workflow contract.`);
  }
}

function validateLoraBindingCompatibility(path, checkpoint, lora) {
  if (!checkpoint || !lora) return;
  if (checkpoint.architecture !== lora.architecture) {
    throw new Error(
      `${path} architecture mismatch: checkpoint ${checkpoint.id} is ${checkpoint.architecture}, LoRA ${lora.id} is ${lora.architecture}.`,
    );
  }
  if (checkpoint.styleFamily !== lora.styleFamily) {
    throw new Error(
      `${path} lane mismatch: checkpoint ${checkpoint.id} is ${checkpoint.styleFamily}, LoRA ${lora.id} is ${lora.styleFamily}.`,
    );
  }
}

const DEFAULT_SIZE_PRESETS = [
  { height: 1280, id: "portrait_3_5", label: "Portrait 3:5", width: 768 },
  { height: 1152, id: "portrait_2_3", label: "Portrait 2:3", width: 768 },
  { height: 1280, id: "portrait_4_5", label: "Portrait 4:5", width: 1024 },
  { height: 1024, id: "square_1_1", label: "Square 1:1", width: 1024 },
  { height: 768, id: "landscape_5_3", label: "Landscape 5:3", width: 1280 },
];

function normalizeGenerationParams(path, value) {
  if (value === undefined || value === null || value === "") return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object when provided.`);
  }
  const sizePresetsRaw = Array.isArray(value.sizePresets) ? value.sizePresets : [];
  const sizePresets = sizePresetsRaw
    .map((preset, index) => normalizeSizePreset(`${path}.sizePresets[${index}]`, preset))
    .filter(Boolean);
  const presets = sizePresets.length ? sizePresets : DEFAULT_SIZE_PRESETS;
  const defaultSizePresetId = readString(`${path}.defaultSizePresetId`, value.defaultSizePresetId) || presets[0].id;
  if (!presets.some((preset) => preset.id === defaultSizePresetId)) {
    throw new Error(`${path}.defaultSizePresetId must reference an existing size preset.`);
  }
  const batchSizeMin = readNumber(`${path}.batchSizeMin`, value.batchSizeMin, 1);
  const batchSizeMax = readNumber(`${path}.batchSizeMax`, value.batchSizeMax, 4);
  if (batchSizeMin < 1 || batchSizeMax < batchSizeMin) {
    throw new Error(`${path} batch size bounds are invalid.`);
  }
  const batchSizeDefault = readNumber(`${path}.batchSizeDefault`, value.batchSizeDefault, 1);
  if (batchSizeDefault < batchSizeMin || batchSizeDefault > batchSizeMax) {
    throw new Error(`${path}.batchSizeDefault must be inside min/max.`);
  }
  return {
    batchSizeDefault,
    batchSizeMax,
    batchSizeMin,
    batchSizeFieldName: readString(`${path}.batchSizeFieldName`, value.batchSizeFieldName),
    defaultSizePresetId,
    heightFieldName: readString(`${path}.heightFieldName`, value.heightFieldName),
    ksamplerNodeId: readString(`${path}.ksamplerNodeId`, value.ksamplerNodeId),
    latentNodeId: readString(`${path}.latentNodeId`, value.latentNodeId),
    seedFieldName: readString(`${path}.seedFieldName`, value.seedFieldName),
    sizePresets: presets,
    widthFieldName: readString(`${path}.widthFieldName`, value.widthFieldName),
  };
}

function normalizeSizePreset(path, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  const id = readString(`${path}.id`, value.id);
  const label = readString(`${path}.label`, value.label) || id;
  const width = readNumber(`${path}.width`, value.width, null);
  const height = readNumber(`${path}.height`, value.height, null);
  if (!id || !width || !height) {
    throw new Error(`${path} must include id, width, and height.`);
  }
  return { height, id, label, width };
}

function validateGenerationParamsContract(contractJson, path, generationParams) {
  if (!generationParams) return;
  validateContractField(contractJson, `${path}.latent.width`, generationParams.latentNodeId, generationParams.widthFieldName);
  validateContractField(contractJson, `${path}.latent.height`, generationParams.latentNodeId, generationParams.heightFieldName);
  validateContractField(contractJson, `${path}.latent.batchSize`, generationParams.latentNodeId, generationParams.batchSizeFieldName);
  validateContractField(contractJson, `${path}.ksampler.seed`, generationParams.ksamplerNodeId, generationParams.seedFieldName);
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
  assertNoLegacyRegionToken(`checkpoints[${index}].id`, id);
  assertNoLegacyRegionToken(`checkpoints[${index}].label`, label);
  if (!id || !label || !ckptName) {
    throw new Error(`checkpoints[${index}] must include id, label, and ckptName.`);
  }
  const tags = normalizeLaneTags(`checkpoints[${index}].tags`, entry.tags, true);
  checkpoints.push({
    architecture: normalizeArchitecture(`checkpoints[${index}].architecture`, entry.architecture, true),
    ckptName,
    id,
    isActive: entry.isActive === undefined ? true : Boolean(entry.isActive),
    label,
    purpose: readString(`checkpoints[${index}].purpose`, entry.purpose),
    sortOrder: Number.isFinite(entry.sortOrder) ? Number(entry.sortOrder) : index + 1,
    styleFamily: normalizeLane(`checkpoints[${index}].styleFamily`, entry.styleFamily, true),
    tag: tags.join(","),
    tags: tags.join(","),
  });
}

const lorasRaw = Array.isArray(config?.loras) ? config.loras : [];
const loras = [];
for (const [index, entry] of lorasRaw.entries()) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`loras[${index}] must be an object.`);
  }
  const id = readString(`loras[${index}].id`, entry.id);
  const label = readString(`loras[${index}].label`, entry.label);
  const loraName = readString(`loras[${index}].loraName`, entry.loraName);
  assertNoLegacyRegionToken(`loras[${index}].id`, id);
  assertNoLegacyRegionToken(`loras[${index}].label`, label);
  if (!id || !label || !loraName) {
    throw new Error(`loras[${index}] must include id, label, and loraName.`);
  }
  const tags = normalizeLaneTags(`loras[${index}].tags`, entry.tags, true);
  loras.push({
    architecture: normalizeArchitecture(`loras[${index}].architecture`, entry.architecture, true),
    defaultClipStrength:
      entry.defaultClipStrength === null || entry.defaultClipStrength === undefined || entry.defaultClipStrength === ""
        ? null
        : readNumber(`loras[${index}].defaultClipStrength`, entry.defaultClipStrength, null),
    defaultModelStrength: readNumber(`loras[${index}].defaultModelStrength`, entry.defaultModelStrength, 1),
    id,
    isActive: entry.isActive === undefined ? true : Boolean(entry.isActive),
    label,
    loraName,
    purpose: readString(`loras[${index}].purpose`, entry.purpose),
    sortOrder: Number.isFinite(entry.sortOrder) ? Number(entry.sortOrder) : index + 1,
    styleFamily: normalizeLane(`loras[${index}].styleFamily`, entry.styleFamily, true),
    tags: tags.join(","),
  });
}

const checkpointsById = new Map(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]));
const lorasById = new Map(loras.map((lora) => [lora.id, lora]));
const loraIds = new Set(loras.map((lora) => lora.id));

async function main() {
const workflows = {};
const workflowRows = [];
const bindings = [];
const loraBindings = [];
for (const key of Object.keys(workflowsRaw)) {
  assertSemanticWorkflowKey(`workflows.${key}`, key);
  const entry = workflowsRaw[key] ?? {};
  if (typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`workflows.${key} must be an object.`);
  }

  const mode = readString(`workflows.${key}.mode`, entry.mode) || "create";
  if (mode !== "create" && mode !== "variation" && mode !== "cutout") {
    throw new Error(`workflows.${key}.mode must be "create", "variation", or "cutout".`);
  }
  const architecture = normalizeArchitecture(`workflows.${key}.architecture`, entry.architecture, true, { workflow: true });
  const workflowId = readString(`workflows.${key}.workflowId`, entry.workflowId);
  const promptNodeId = readString(`workflows.${key}.promptNodeId`, entry.promptNodeId);
  const promptFieldName =
    readString(`workflows.${key}.promptFieldName`, entry.promptFieldName) || "text";
  const checkpointNodeId = readString(`workflows.${key}.checkpointNodeId`, entry.checkpointNodeId);
  const checkpointFieldName =
    readString(`workflows.${key}.checkpointFieldName`, entry.checkpointFieldName) || "ckpt_name";
  const loadImageNodeId = readString(`workflows.${key}.loadImageNodeId`, entry.loadImageNodeId);
  const loadImageFieldName =
    readString(`workflows.${key}.loadImageFieldName`, entry.loadImageFieldName) || "image";
  const negativePromptNodeId =
    readString(`workflows.${key}.negativePromptNodeId`, entry.negativePromptNodeId);
  const negativePromptFieldName =
    readString(`workflows.${key}.negativePromptFieldName`, entry.negativePromptFieldName) || "prompt";
  const loraNodeId = readString(`workflows.${key}.loraNodeId`, entry.loraNodeId);
  const loraNameFieldName =
    readString(`workflows.${key}.loraNameFieldName`, entry.loraNameFieldName) || "lora_name";
  const loraModelStrengthFieldName =
    readString(`workflows.${key}.loraModelStrengthFieldName`, entry.loraModelStrengthFieldName) || "strength_model";
  const loraClipStrengthFieldName =
    readString(`workflows.${key}.loraClipStrengthFieldName`, entry.loraClipStrengthFieldName);
  const generationParams = normalizeGenerationParams(`workflows.${key}.generationParams`, entry.generationParams);
  const label = readString(`workflows.${key}.label`, entry.label) || key;
  const modelIds = Array.isArray(entry.modelIds)
    ? entry.modelIds.map((id) => readString(`workflows.${key}.modelIds[]`, id)).filter(Boolean)
    : [];
  const modelIdSet = new Set(modelIds);
  if (architecture === "none" && modelIds.length > 0) {
    throw new Error(`workflows.${key}.modelIds must be empty when architecture is "none".`);
  }
  for (const [index, modelId] of modelIds.entries()) {
    const checkpoint = checkpointsById.get(modelId);
    if (!checkpoint) {
      throw new Error(`workflows.${key}.modelIds[${index}] is not in checkpoints[].`);
    }
    if (checkpoint.architecture !== architecture) {
      throw new Error(
        `workflows.${key}.modelIds[${index}] architecture mismatch: workflow is ${architecture}, checkpoint ${modelId} is ${checkpoint.architecture}.`,
      );
    }
  }

  const anySet = workflowId || promptNodeId || checkpointNodeId || loadImageNodeId;
  if (anySet) {
    if (!workflowId || (mode !== "cutout" && !promptNodeId)) {
      throw new Error(
        mode === "cutout"
          ? `workflows.${key} must include workflowId when configured.`
          : `workflows.${key} must include workflowId and promptNodeId when configured.`,
      );
    }
    if ((mode === "variation" || mode === "cutout" || architecture === "none") && !loadImageNodeId) {
      throw new Error(`workflows.${key} (${mode}) must include loadImageNodeId when configured.`);
    }
  }

  const contract =
    (workflowId ? await fetchContract(key, workflowId) : null) ?? parseContractJson(entry.contractJson);
  if (contract?.contractJson) {
    validateContractField(contract.contractJson, `workflows.${key}.prompt`, promptNodeId, promptFieldName);
    validateContractField(contract.contractJson, `workflows.${key}.checkpoint`, checkpointNodeId, checkpointFieldName);
    validateContractField(contract.contractJson, `workflows.${key}.loadImage`, loadImageNodeId, loadImageFieldName);
    validateContractField(
      contract.contractJson,
      `workflows.${key}.negativePrompt`,
      negativePromptNodeId,
      negativePromptFieldName,
    );
    validateContractField(contract.contractJson, `workflows.${key}.loraName`, loraNodeId, loraNameFieldName);
    validateContractField(
      contract.contractJson,
      `workflows.${key}.loraModelStrength`,
      loraNodeId,
      loraModelStrengthFieldName,
    );
    validateContractField(
      contract.contractJson,
      `workflows.${key}.loraClipStrength`,
      loraNodeId,
      loraClipStrengthFieldName,
    );
    validateGenerationParamsContract(contract.contractJson, `workflows.${key}.generationParams`, generationParams);
  }

  const workflowLoraBindings = Array.isArray(entry.loraBindings) ? entry.loraBindings : [];
  if (architecture === "none" && workflowLoraBindings.length > 0) {
    throw new Error(`workflows.${key}.loraBindings must be empty when architecture is "none".`);
  }
  for (const [index, binding] of workflowLoraBindings.entries()) {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
      throw new Error(`workflows.${key}.loraBindings[${index}] must be an object.`);
    }
    const modelId = readString(`workflows.${key}.loraBindings[${index}].modelId`, binding.modelId);
    const loraId = readString(`workflows.${key}.loraBindings[${index}].loraId`, binding.loraId);
    if (!modelId || !loraId) {
      throw new Error(`workflows.${key}.loraBindings[${index}] must include modelId and loraId.`);
    }
    if (!modelIdSet.has(modelId)) {
      throw new Error(`workflows.${key}.loraBindings[${index}].modelId is not in workflows.${key}.modelIds.`);
    }
    if (!loraIds.has(loraId)) {
      throw new Error(`workflows.${key}.loraBindings[${index}].loraId is not in loras[].`);
    }
    if (!loraNodeId) {
      throw new Error(`workflows.${key} has LoRA bindings but no loraNodeId.`);
    }
    validateLoraBindingCompatibility(
      `workflows.${key}.loraBindings[${index}]`,
      checkpointsById.get(modelId),
      lorasById.get(loraId),
    );
    loraBindings.push({ loraId, modelId, sortOrder: index + 1, workflowKey: key });
  }

  workflows[key] = {
    architecture,
    label,
    mode,
    workflowId,
    promptNodeId,
    promptFieldName,
    ...(checkpointNodeId ? { checkpointNodeId } : {}),
    ...(checkpointFieldName ? { checkpointFieldName } : {}),
    ...(loadImageNodeId ? { loadImageNodeId } : {}),
    ...(loadImageFieldName ? { loadImageFieldName } : {}),
    ...(negativePromptNodeId ? { negativePromptNodeId } : {}),
    ...(negativePromptFieldName ? { negativePromptFieldName } : {}),
    ...(loraNodeId ? { loraNodeId } : {}),
    ...(loraNameFieldName ? { loraNameFieldName } : {}),
    ...(loraModelStrengthFieldName ? { loraModelStrengthFieldName } : {}),
    ...(loraClipStrengthFieldName ? { loraClipStrengthFieldName } : {}),
    ...(generationParams ? { generationParams } : {}),
    ...(contract?.contractHash ? { contractHash: contract.contractHash } : {}),
    ...(modelIds.length ? { modelIds } : {}),
  };
  workflowRows.push({
    architecture,
    checkpointFieldName,
    checkpointNodeId,
    contractHash: contract?.contractHash || null,
    contractJson: contract?.contractJson || null,
    contractRefreshedAt: contract?.contractJson ? now : null,
    isActive: entry.isActive === undefined ? true : Boolean(entry.isActive),
    key,
    label,
    loadImageFieldName,
    loadImageNodeId,
    loraClipStrengthFieldName,
    loraModelStrengthFieldName,
    loraNameFieldName,
    loraNodeId,
    generationParamsJson: generationParams ? JSON.stringify(generationParams) : null,
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

const topLevelLoraBindingsRaw = Array.isArray(config?.loraBindings) ? config.loraBindings : [];
for (const [index, binding] of topLevelLoraBindingsRaw.entries()) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    throw new Error(`loraBindings[${index}] must be an object.`);
  }
  const workflowKey = readString(`loraBindings[${index}].workflowKey`, binding.workflowKey);
  const modelId = readString(`loraBindings[${index}].modelId`, binding.modelId);
  const loraId = readString(`loraBindings[${index}].loraId`, binding.loraId);
  const workflow = workflowRows.find((row) => row.key === workflowKey);
  if (!workflowKey || !modelId || !loraId || !workflow) {
    throw new Error(`loraBindings[${index}] must include valid workflowKey, modelId, and loraId.`);
  }
  if (!bindings.some((row) => row.workflowKey === workflowKey && row.modelId === modelId)) {
    throw new Error(`loraBindings[${index}] references a workflow/model pair that is not bound.`);
  }
  if (!loraIds.has(loraId)) {
    throw new Error(`loraBindings[${index}].loraId is not in loras[].`);
  }
  if (!workflow.loraNodeId) {
    throw new Error(`loraBindings[${index}] references workflow ${workflowKey}, but it has no loraNodeId.`);
  }
  validateLoraBindingCompatibility(
    `loraBindings[${index}]`,
    checkpointsById.get(modelId),
    lorasById.get(loraId),
  );
  loraBindings.push({ loraId, modelId, sortOrder: index + 1, workflowKey });
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
    "INSERT INTO image_models",
    "  (id, label, tag, ckpt_name, architecture, style_family, purpose, tags, is_active, sort_order, updated_at, updated_by)",
    `VALUES (${sqlString(checkpoint.id)}, ${sqlString(checkpoint.label)}, ${sqlString(checkpoint.tag)}, ${sqlString(checkpoint.ckptName)}, ${sqlString(checkpoint.architecture)}, ${sqlString(checkpoint.styleFamily)}, ${sqlString(checkpoint.purpose)}, ${sqlString(checkpoint.tags)}, ${checkpoint.isActive ? 1 : 0}, ${checkpoint.sortOrder}, ${now}, NULL)`,
    "ON CONFLICT(id) DO UPDATE SET",
    "  label = excluded.label,",
    "  tag = excluded.tag,",
    "  ckpt_name = excluded.ckpt_name,",
    "  architecture = excluded.architecture,",
    "  style_family = excluded.style_family,",
    "  purpose = excluded.purpose,",
    "  tags = excluded.tags,",
    "  is_active = excluded.is_active,",
    "  sort_order = excluded.sort_order,",
    "  updated_at = excluded.updated_at,",
    "  updated_by = excluded.updated_by;",
  ].join("\n"));
}

for (const lora of loras) {
  statements.push([
    "INSERT INTO image_loras",
    "  (id, label, lora_name, architecture, style_family, purpose, tags, default_model_strength, default_clip_strength, is_active, sort_order, updated_at, updated_by)",
    `VALUES (${sqlString(lora.id)}, ${sqlString(lora.label)}, ${sqlString(lora.loraName)}, ${sqlString(lora.architecture)}, ${sqlString(lora.styleFamily)}, ${sqlString(lora.purpose)}, ${sqlString(lora.tags)}, ${lora.defaultModelStrength}, ${lora.defaultClipStrength == null ? "NULL" : lora.defaultClipStrength}, ${lora.isActive ? 1 : 0}, ${lora.sortOrder}, ${now}, NULL)`,
    "ON CONFLICT(id) DO UPDATE SET",
    "  label = excluded.label,",
    "  lora_name = excluded.lora_name,",
    "  architecture = excluded.architecture,",
    "  style_family = excluded.style_family,",
    "  purpose = excluded.purpose,",
    "  tags = excluded.tags,",
    "  default_model_strength = excluded.default_model_strength,",
    "  default_clip_strength = excluded.default_clip_strength,",
    "  is_active = excluded.is_active,",
    "  sort_order = excluded.sort_order,",
    "  updated_at = excluded.updated_at,",
    "  updated_by = excluded.updated_by;",
  ].join("\n"));
}

for (const workflow of workflowRows) {
  statements.push([
    "INSERT INTO image_workflows",
    "  (key, label, architecture, mode, workflow_id, prompt_node_id, prompt_field_name, checkpoint_node_id, checkpoint_field_name, load_image_node_id, load_image_field_name, negative_prompt_node_id, negative_prompt_field_name, contract_json, contract_hash, contract_refreshed_at, lora_node_id, lora_name_field_name, lora_model_strength_field_name, lora_clip_strength_field_name, generation_params_json, is_active, sort_order, updated_at, updated_by)",
    `VALUES (${sqlString(workflow.key)}, ${sqlString(workflow.label)}, ${sqlString(workflow.architecture)}, ${sqlString(workflow.mode)}, ${sqlString(workflow.workflowId)}, ${sqlString(workflow.promptNodeId)}, ${sqlString(workflow.promptFieldName)}, ${workflow.checkpointNodeId ? sqlString(workflow.checkpointNodeId) : "NULL"}, ${sqlString(workflow.checkpointFieldName)}, ${workflow.loadImageNodeId ? sqlString(workflow.loadImageNodeId) : "NULL"}, ${sqlString(workflow.loadImageFieldName)}, ${workflow.negativePromptNodeId ? sqlString(workflow.negativePromptNodeId) : "NULL"}, ${sqlString(workflow.negativePromptFieldName)}, ${workflow.contractJson ? sqlString(workflow.contractJson) : "NULL"}, ${workflow.contractHash ? sqlString(workflow.contractHash) : "NULL"}, ${workflow.contractRefreshedAt == null ? "NULL" : workflow.contractRefreshedAt}, ${workflow.loraNodeId ? sqlString(workflow.loraNodeId) : "NULL"}, ${sqlString(workflow.loraNameFieldName)}, ${sqlString(workflow.loraModelStrengthFieldName)}, ${workflow.loraClipStrengthFieldName ? sqlString(workflow.loraClipStrengthFieldName) : "NULL"}, ${workflow.generationParamsJson ? sqlString(workflow.generationParamsJson) : "NULL"}, ${workflow.isActive ? 1 : 0}, ${workflow.sortOrder}, ${now}, NULL)`,
    "ON CONFLICT(key) DO UPDATE SET",
    "  label = excluded.label,",
    "  architecture = excluded.architecture,",
    "  mode = excluded.mode,",
    "  workflow_id = excluded.workflow_id,",
    "  prompt_node_id = excluded.prompt_node_id,",
    "  prompt_field_name = excluded.prompt_field_name,",
    "  checkpoint_node_id = excluded.checkpoint_node_id,",
    "  checkpoint_field_name = excluded.checkpoint_field_name,",
    "  load_image_node_id = excluded.load_image_node_id,",
    "  load_image_field_name = excluded.load_image_field_name,",
    "  negative_prompt_node_id = excluded.negative_prompt_node_id,",
    "  negative_prompt_field_name = excluded.negative_prompt_field_name,",
    "  contract_json = excluded.contract_json,",
    "  contract_hash = excluded.contract_hash,",
    "  contract_refreshed_at = excluded.contract_refreshed_at,",
    "  lora_node_id = excluded.lora_node_id,",
    "  lora_name_field_name = excluded.lora_name_field_name,",
    "  lora_model_strength_field_name = excluded.lora_model_strength_field_name,",
    "  lora_clip_strength_field_name = excluded.lora_clip_strength_field_name,",
    "  generation_params_json = excluded.generation_params_json,",
    "  is_active = excluded.is_active,",
    "  sort_order = excluded.sort_order,",
    "  updated_at = excluded.updated_at,",
    "  updated_by = excluded.updated_by;",
  ].join("\n"));
  statements.push(`DELETE FROM image_workflow_model_loras WHERE workflow_key = ${sqlString(workflow.key)};`);
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

for (const binding of loraBindings) {
  statements.push([
    "INSERT INTO image_workflow_model_loras (workflow_key, model_id, lora_id, is_active, sort_order, updated_at, updated_by)",
    `VALUES (${sqlString(binding.workflowKey)}, ${sqlString(binding.modelId)}, ${sqlString(binding.loraId)}, 1, ${binding.sortOrder}, ${now}, NULL)`,
    "ON CONFLICT(workflow_key, model_id, lora_id) DO UPDATE SET",
    "  is_active = excluded.is_active,",
    "  sort_order = excluded.sort_order,",
    "  updated_at = excluded.updated_at,",
    "  updated_by = excluded.updated_by;",
  ].join("\n"));
}

console.log(statements.join("\n\n"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
NODE

echo "RunningHub config: $config_file"
echo "D1 database: $database_name"

if [ "$dry_run" -eq 1 ]; then
    echo "Dry run SQL:"
    cat "$sql_tmp"
    exit 0
fi

npx wrangler d1 execute "$database_name" --remote --config "$wrangler_config" --file "$sql_tmp"
echo "Done. RunningHub workflow/checkpoint config synced to $target D1."
