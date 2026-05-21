import { ALL_DIMENSIONS, type DimensionValues } from "../relationships/level";
import {
  EVENT_TYPES,
  type EventPayload,
  type EventStatus,
  type EventTemplateOption,
  type EventTemplateSnapshot,
  type EventType,
} from "./types";

const EVENT_TYPE_SET = new Set<string>(EVENT_TYPES);
const STATUS_SET = new Set<string>(["pending", "resolved", "dismissed"]);

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && EVENT_TYPE_SET.has(value);
}

export function parseEventStatus(value: string | null): EventStatus | null {
  const status = value ?? "pending";
  return STATUS_SET.has(status) ? (status as EventStatus) : null;
}

export function parseSceneEventTypes(raw: string | null): EventType[] {
  const parsed = safeJson<unknown>(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isEventType).filter((type) => type !== "conflict");
}

export function parseTemplateOptions(raw: string | null): EventTemplateOption[] {
  const parsed = safeJson<unknown>(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item): EventTemplateOption | null => {
      if (!isRecord(item)) return null;
      const id = item.id;
      const semantic = item.semantic;
      const promptHint = item.prompt_hint;
      if (typeof id !== "string" || typeof semantic !== "string" || typeof promptHint !== "string") {
        return null;
      }
      return {
        id,
        prompt_hint: promptHint,
        semantic,
        signals: parseSignals(item.signals),
      };
    })
    .filter((item): item is EventTemplateOption => item !== null);
}

export function buildTemplateSnapshot(args: {
  template_id: string;
  event_type: EventType;
  companion_filter: string;
  options: EventTemplateOption[];
}): EventTemplateSnapshot {
  return {
    companion_filter: args.companion_filter,
    event_type: args.event_type,
    options: args.options,
    template_id: args.template_id,
    version: 1,
  };
}

export function parseTemplateSnapshot(raw: string | null): EventTemplateSnapshot | null {
  const parsed = safeJson<unknown>(raw);
  if (!isRecord(parsed) || parsed.version !== 1 || !isEventType(parsed.event_type)) {
    return null;
  }
  if (typeof parsed.template_id !== "string" || typeof parsed.companion_filter !== "string") {
    return null;
  }
  const options = Array.isArray(parsed.options)
    ? parsed.options
        .map((item): EventTemplateOption | null => {
          if (!isRecord(item)) return null;
          if (typeof item.id !== "string" || typeof item.semantic !== "string" || typeof item.prompt_hint !== "string") {
            return null;
          }
          return {
            id: item.id,
            prompt_hint: item.prompt_hint,
            semantic: item.semantic,
            signals: parseSignals(item.signals),
          };
        })
        .filter((item): item is EventTemplateOption => item !== null)
    : [];

  return {
    companion_filter: parsed.companion_filter,
    event_type: parsed.event_type,
    options,
    template_id: parsed.template_id,
    version: 1,
  };
}

export function parseEventPayload(raw: string | null): EventPayload {
  const parsed = safeJson<unknown>(raw);
  if (!isRecord(parsed)) return { description: "", options: [] };
  const description = typeof parsed.description === "string" ? parsed.description : "";
  const options = Array.isArray(parsed.options)
    ? parsed.options
        .map((item): { id: string; label: string } | null => {
          if (!isRecord(item) || typeof item.id !== "string" || typeof item.label !== "string") {
            return null;
          }
          return { id: item.id, label: item.label };
        })
        .filter((item): item is { id: string; label: string } => item !== null)
    : [];
  return { description, options };
}

export function parseMetadata(raw: string | null): Record<string, unknown> | null {
  const parsed = safeJson<unknown>(raw);
  return isRecord(parsed) ? parsed : null;
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

export function safeJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseSignals(raw: unknown): Partial<DimensionValues> {
  if (!isRecord(raw)) return {};
  const out: Partial<DimensionValues> = {};
  for (const dim of ALL_DIMENSIONS) {
    const value = raw[dim];
    if (typeof value === "number" && Number.isFinite(value)) {
      out[dim] = value;
    }
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
