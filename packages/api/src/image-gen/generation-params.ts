export type ImageSizePreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

export type WorkflowGenerationParams = {
  sizePresets: ImageSizePreset[];
  defaultSizePresetId: string;
  latentNodeId?: string;
  widthFieldName?: string;
  heightFieldName?: string;
  batchSizeFieldName?: string;
  ksamplerNodeId?: string;
  seedFieldName?: string;
  batchSizeDefault: number;
  batchSizeMin: number;
  batchSizeMax: number;
};

export type ImageGenerationParamValues = {
  size_preset: string;
  width: number;
  height: number;
  batch_size: number;
  seed: number;
};

export const DEFAULT_SIZE_PRESETS: ImageSizePreset[] = [
  { height: 1280, id: "portrait_3_5", label: "Portrait 3:5", width: 768 },
  { height: 1152, id: "portrait_2_3", label: "Portrait 2:3", width: 768 },
  { height: 1280, id: "portrait_4_5", label: "Portrait 4:5", width: 1024 },
  { height: 1024, id: "square_1_1", label: "Square 1:1", width: 1024 },
  { height: 768, id: "landscape_5_3", label: "Landscape 5:3", width: 1280 },
];

export const DEFAULT_WORKFLOW_GENERATION_PARAMS: WorkflowGenerationParams = {
  batchSizeDefault: 1,
  batchSizeMax: 4,
  batchSizeMin: 1,
  defaultSizePresetId: "portrait_3_5",
  sizePresets: DEFAULT_SIZE_PRESETS,
};

export function parseWorkflowGenerationParams(
  raw: string | null | undefined,
): WorkflowGenerationParams | null {
  if (!raw) return null;
  try {
    return normalizeWorkflowGenerationParams(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function normalizeWorkflowGenerationParams(input: unknown): WorkflowGenerationParams {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return DEFAULT_WORKFLOW_GENERATION_PARAMS;
  }
  const value = input as Record<string, unknown>;
  const sizePresets = Array.isArray(value.sizePresets)
    ? value.sizePresets.map(toSizePreset).filter((preset): preset is ImageSizePreset => preset != null)
    : [];
  const presets = sizePresets.length > 0 ? sizePresets : DEFAULT_SIZE_PRESETS;
  const requestedDefault = readString(value.defaultSizePresetId);
  const defaultSizePresetId = presets.some((preset) => preset.id === requestedDefault)
    ? requestedDefault
    : presets[0]?.id ?? "portrait_3_5";
  const batchSizeMin = clampInt(readNumber(value.batchSizeMin), 1, 16, 1);
  const batchSizeMax = Math.max(batchSizeMin, clampInt(readNumber(value.batchSizeMax), 1, 16, 4));
  return {
    batchSizeDefault: clampInt(readNumber(value.batchSizeDefault), batchSizeMin, batchSizeMax, 1),
    batchSizeMax,
    batchSizeMin,
    batchSizeFieldName: readString(value.batchSizeFieldName) || undefined,
    defaultSizePresetId,
    heightFieldName: readString(value.heightFieldName) || undefined,
    ksamplerNodeId: readString(value.ksamplerNodeId) || undefined,
    latentNodeId: readString(value.latentNodeId) || undefined,
    seedFieldName: readString(value.seedFieldName) || undefined,
    sizePresets: presets,
    widthFieldName: readString(value.widthFieldName) || undefined,
  };
}

export function serializeWorkflowGenerationParams(input: unknown): string {
  return JSON.stringify(normalizeWorkflowGenerationParams(input));
}

export function buildGenerationParamValues(
  config: WorkflowGenerationParams | null,
  input: { batchSize?: number | null; seed?: number | null; sizePresetId?: string | null },
): ImageGenerationParamValues | null {
  if (!config) return null;
  const preset =
    config.sizePresets.find((item) => item.id === input.sizePresetId) ??
    config.sizePresets.find((item) => item.id === config.defaultSizePresetId) ??
    config.sizePresets[0];
  if (!preset) return null;
  const batchSize = clampInt(
    input.batchSize,
    config.batchSizeMin,
    config.batchSizeMax,
    config.batchSizeDefault,
  );
  return {
    batch_size: batchSize,
    height: preset.height,
    seed: normalizeSeed(input.seed),
    size_preset: preset.id,
    width: preset.width,
  };
}

export function parseGenerationParamValues(
  raw: string | null | undefined,
): ImageGenerationParamValues | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<ImageGenerationParamValues>;
    if (!value || typeof value !== "object") return undefined;
    const width = readNumber(value.width);
    const height = readNumber(value.height);
    const batchSize = readNumber(value.batch_size);
    const seed = readNumber(value.seed);
    const sizePreset = readString(value.size_preset);
    if (!width || !height || !batchSize || seed == null || !sizePreset) return undefined;
    return {
      batch_size: batchSize,
      height,
      seed,
      size_preset: sizePreset,
      width,
    };
  } catch {
    return undefined;
  }
}

function toSizePreset(input: unknown): ImageSizePreset | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const id = readString(value.id);
  const label = readString(value.label) || id;
  const width = readNumber(value.width);
  const height = readNumber(value.height);
  if (!id || !width || !height) return null;
  return { height, id, label, width };
}

function readString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return undefined;
}

function clampInt(value: number | null | undefined, min: number, max: number, fallback: number): number {
  const next = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return Math.max(min, Math.min(max, next));
}

function normalizeSeed(seed: number | null | undefined): number {
  if (typeof seed === "number" && Number.isFinite(seed) && seed >= 0) {
    return Math.trunc(seed);
  }
  return Math.floor(Math.random() * 1_000_000_000_000);
}
