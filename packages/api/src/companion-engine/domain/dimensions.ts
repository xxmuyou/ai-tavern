import { isRecord } from "./json";
import type { DimensionDefinition } from "./types";

export const DEFAULT_RELATIONSHIP_DIMENSIONS = [
  "affection",
  "trust",
  "intimacy",
  "dependency",
  "tension",
  "curiosity",
  "caution",
] as const;

export function normalizeDimensionKey(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") ?? "";
  return /^[a-z][a-z0-9_]{1,63}$/.test(normalized) ? normalized : "";
}

export function normalizeCharacterKey(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") ?? "";
  return /^[a-z0-9][a-z0-9-]{1,63}$/.test(normalized) ? normalized : "";
}

export function clampDimensionValue(value: number, definition: DimensionDefinition | undefined): number {
  const min = definition?.minValue ?? 0;
  const max = definition?.maxValue ?? 100;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function parseDefaultNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function validateDimensionValue(value: unknown, definition: DimensionDefinition): unknown {
  if (definition.valueType === "number") {
    return clampDimensionValue(typeof value === "number" ? value : parseDefaultNumber(value), definition);
  }

  if (definition.valueType === "string") {
    return typeof value === "string" ? value.trim().slice(0, 1000) : "";
  }

  if (definition.valueType === "string_list") {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 32)
      : [];
  }

  return isRecord(value) || Array.isArray(value) ? value : {};
}
