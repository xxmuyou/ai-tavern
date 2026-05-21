import { loadRelationship } from "../relationships/engine";
import { ALL_DIMENSIONS, type Dimension, type DimensionValues, ZERO_DIMENSIONS } from "../relationships/level";
import { parseMetadata, parseSceneEventTypes } from "./parse";
import { snapshotForTemplate, loadTemplateForCompanion } from "./templates";
import type { EventTemplate, EventType, TriggerCandidate } from "./types";

const SCENE_TRIGGER_TYPES = new Set<EventType>(["invitation", "gift", "confession", "milestone"]);
const DAY_MS = 86_400_000;

export type SceneForEventTrigger = {
  id: string;
  name: string;
  mood: string;
  possible_events: string | null;
};

export async function evaluateTriggersForScene(
  env: Env,
  userId: string,
  scene: SceneForEventTrigger,
  companions: Array<{ id: string }>,
  now: number,
): Promise<TriggerCandidate | null> {
  const allowedTypes = parseSceneEventTypes(scene.possible_events).filter((type) => SCENE_TRIGGER_TYPES.has(type));
  if (allowedTypes.length === 0 || companions.length === 0) return null;

  const candidates: TriggerCandidate[] = [];
  for (const companion of companions) {
    if (await hasPendingEvent(env, userId, companion.id)) continue;

    const relationship = await loadRelationship(env, userId, companion.id);
    const dimensions = relationship?.dimensions ?? { ...ZERO_DIMENSIONS };

    for (const eventType of allowedTypes) {
      const template = await loadTemplateForCompanion(env, eventType, companion.id);
      if (!template) continue;

      const metadata = eventType === "milestone"
        ? await pickMilestoneMetadata(env, userId, companion.id, relationship?.first_met_at ?? null, now)
        : null;
      if (eventType === "milestone" && !metadata) continue;

      if (!(await passesEventHistory(env, userId, companion.id, template, now, metadata))) continue;
      if (!passesRelationshipThresholds(template, dimensions)) continue;
      if (Math.random() >= template.trigger_probability) continue;

      candidates.push({
        companionId: companion.id,
        metadata,
        sceneId: scene.id,
        snapshot: snapshotForTemplate(template),
        template,
      });
    }
  }

  candidates.sort((a, b) => b.template.priority - a.template.priority);
  return candidates[0] ?? null;
}

export async function evaluateConflictTrigger(
  env: Env,
  userId: string,
  companionId: string,
  sceneId: string | null,
  signalsDelta: Partial<DimensionValues>,
  now: number,
): Promise<TriggerCandidate | null> {
  if (await hasPendingEvent(env, userId, companionId)) return null;

  const template = await loadTemplateForCompanion(env, "conflict", companionId);
  if (!template || !passesSignalTrigger(template.signal_trigger, signalsDelta)) {
    return null;
  }

  if (!(await passesEventHistory(env, userId, companionId, template, now, null))) {
    return null;
  }

  return {
    companionId,
    metadata: null,
    sceneId,
    snapshot: snapshotForTemplate(template),
    template,
  };
}

export async function hasPendingEvent(
  env: Env,
  userId: string,
  companionId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM events WHERE user_id = ? AND companion_id = ? AND status = 'pending' LIMIT 1`,
  )
    .bind(userId, companionId)
    .first<{ id: string }>();
  return Boolean(row);
}

async function passesEventHistory(
  env: Env,
  userId: string,
  companionId: string,
  template: EventTemplate,
  now: number,
  metadata: Record<string, unknown> | null,
): Promise<boolean> {
  if (template.event_type === "milestone" && metadata?.milestone_type) {
    return !(await hasMilestoneSubtype(env, userId, companionId, String(metadata.milestone_type)));
  }

  if (template.cooldown_seconds < 0) {
    const row = await env.DB.prepare(
      `SELECT id FROM events
       WHERE user_id = ? AND companion_id = ? AND event_type = ? AND status IN ('pending', 'resolved')
       LIMIT 1`,
    )
      .bind(userId, companionId, template.event_type)
      .first<{ id: string }>();
    return !row;
  }

  const row = await env.DB.prepare(
    `SELECT MAX(created_at) AS latest_created_at
     FROM events
     WHERE user_id = ? AND companion_id = ? AND event_type = ?`,
  )
    .bind(userId, companionId, template.event_type)
    .first<{ latest_created_at: number | null }>();
  const latest = row?.latest_created_at;
  return typeof latest !== "number" || now - latest >= template.cooldown_seconds * 1000;
}

function passesRelationshipThresholds(template: EventTemplate, dimensions: DimensionValues): boolean {
  return (
    passesMin(template.min_closeness, dimensions.closeness) &&
    passesMin(template.min_trust, dimensions.trust) &&
    passesMin(template.min_romance, dimensions.romance) &&
    passesMin(template.min_friendship, dimensions.friendship) &&
    passesMax(template.max_hostility, dimensions.hostility) &&
    passesMax(template.max_tension, dimensions.tension) &&
    passesMax(template.max_distance, dimensions.distance)
  );
}

function passesMin(min: number | null, value: number): boolean {
  return min === null || value >= min;
}

function passesMax(max: number | null, value: number): boolean {
  return max === null || value <= max;
}

function passesSignalTrigger(
  signalTrigger: string | null,
  signalsDelta: Partial<DimensionValues>,
): boolean {
  if (!signalTrigger) return false;
  const [dimensionRaw, thresholdRaw] = signalTrigger.split(":");
  const threshold = Number(thresholdRaw);
  if (!isDimension(dimensionRaw) || !Number.isFinite(threshold)) {
    return false;
  }
  return (signalsDelta[dimensionRaw] ?? 0) >= threshold;
}

async function pickMilestoneMetadata(
  env: Env,
  userId: string,
  companionId: string,
  firstMetAt: number | null,
  now: number,
): Promise<Record<string, unknown> | null> {
  if (firstMetAt !== null && now - firstMetAt >= 30 * DAY_MS) {
    if (!(await hasMilestoneSubtype(env, userId, companionId, "first_30_days"))) {
      return { milestone_type: "first_30_days" };
    }
  }

  const thread = await env.DB.prepare(
    `SELECT message_count FROM threads WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<{ message_count: number }>();
  if ((thread?.message_count ?? 0) >= 100) {
    if (!(await hasMilestoneSubtype(env, userId, companionId, "chat_100"))) {
      return { milestone_type: "chat_100" };
    }
  }

  return null;
}

async function hasMilestoneSubtype(
  env: Env,
  userId: string,
  companionId: string,
  subtype: string,
): Promise<boolean> {
  const { results } = await env.DB.prepare(
    `SELECT metadata
     FROM events
     WHERE user_id = ? AND companion_id = ? AND event_type = 'milestone' AND status IN ('pending', 'resolved')`,
  )
    .bind(userId, companionId)
    .all<{ metadata: string | null }>();

  return (results ?? []).some((row) => parseMetadata(row.metadata)?.milestone_type === subtype);
}

function isDimension(value: unknown): value is Dimension {
  return typeof value === "string" && (ALL_DIMENSIONS as readonly string[]).includes(value);
}
