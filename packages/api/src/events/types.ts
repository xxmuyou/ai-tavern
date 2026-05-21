import type { DimensionValues } from "../relationships/level";

export const EVENT_TYPES = ["invitation", "conflict", "gift", "confession", "milestone"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type EventTemplateOption = {
  id: string;
  semantic: string;
  prompt_hint: string;
  signals: Partial<DimensionValues>;
};

export type EventTemplate = {
  id: string;
  event_type: EventType;
  companion_filter: string;
  trigger_probability: number;
  cooldown_seconds: number;
  priority: number;
  min_closeness: number | null;
  min_trust: number | null;
  min_romance: number | null;
  min_friendship: number | null;
  max_hostility: number | null;
  max_tension: number | null;
  max_distance: number | null;
  signal_trigger: string | null;
  options: EventTemplateOption[];
};

export type EventTemplateSnapshot = {
  version: 1;
  template_id: string;
  event_type: EventType;
  companion_filter: string;
  options: EventTemplateOption[];
};

export type EventPayload = {
  description: string;
  options: Array<{ id: string; label: string }>;
};

export type EventStatus = "pending" | "resolved" | "dismissed";

export type EventResponseItem = {
  id: string;
  companion_id: string;
  scene_id: string | null;
  event_type: EventType;
  payload: EventPayload;
  created_at: number;
};

export type TriggerCandidate = {
  template: EventTemplate;
  snapshot: EventTemplateSnapshot;
  companionId: string;
  sceneId: string | null;
  metadata: Record<string, unknown> | null;
};

export type EventRow = {
  id: string;
  user_id: string;
  companion_id: string;
  scene_id: string | null;
  event_type: string;
  template_id: string | null;
  template_snapshot: string;
  payload: string | null;
  metadata: string | null;
  status: string;
  resolution: string | null;
  created_at: number;
  resolved_at: number | null;
};

export type CompanionForPrompt = {
  id: string;
  name: string;
  personality: string | null;
  speech_style: string | null;
};

export type SceneForPrompt = {
  id: string;
  name: string;
  mood: string;
};
