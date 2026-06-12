import { jsonResponse } from "../http";
import type { DimensionValues } from "../relationships/level";
import { ZERO_DIMENSIONS } from "../relationships/level";
import { applySignals, loadRelationship } from "../relationships/engine";
import { detectAndRecordUnlocks, type UnlockEvent } from "../relationships/unlocks";
import { detectNewSceneUnlocks } from "../scenes/unlock-events";

import { QUICK_GIFT_COOLDOWN_MS } from "./config";
import { onActivityCompleted } from "./memory-hooks";
import { findSceneAction, type SceneActionTone } from "./scene-actions";
import type { ActivityRecord } from "./types";

export type QuickGiftItemId = "coffee" | "flowers";
export type QuickActionKind = "gift" | "scene_action" | "custom_scene_action";
export type QuickActionItemId = QuickGiftItemId | string;
export const CUSTOM_SCENE_ACTION_MAX_LENGTH = 120;

export type QuickActionForPrompt = {
  action_id?: string;
  custom_text?: string;
  item_id: QuickActionItemId;
  kind: QuickActionKind;
  label: string;
  description: string;
  tone: SceneActionTone | "gift";
};

export type QuickActionContext = QuickActionForPrompt & {
  label_zh?: string;
  scene_id: string;
  scene_name: string;
  scene_mood: string;
  scene_tags: string[];
};

type SceneContext = {
  id: string;
  mood: string;
  name: string;
  tags: string[];
} | null;

type ValidationResult =
  | { ok: true; action: QuickActionContext }
  | { ok: false; response: Response };

export function parseQuickAction(
  raw: unknown,
):
  | { type: "gift"; item_id: QuickGiftItemId }
  | { type: "scene_action"; action_id: string }
  | { type: "custom_scene_action"; text: string }
  | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type === "gift") {
    if (obj.item_id !== "coffee" && obj.item_id !== "flowers") return null;
    return { item_id: obj.item_id, type: "gift" };
  }
  if (obj.type === "scene_action" && typeof obj.action_id === "string" && obj.action_id.length > 0) {
    return { action_id: obj.action_id, type: "scene_action" };
  }
  if (obj.type === "custom_scene_action" && typeof obj.text === "string") {
    const text = obj.text.trim();
    if (!text || text.length > CUSTOM_SCENE_ACTION_MAX_LENGTH) return null;
    return { text, type: "custom_scene_action" };
  }
  return null;
}

export async function validateQuickAction(
  env: Env,
  args: {
    userId: string;
    companionId: string;
    now: number;
    raw: unknown;
    scene: SceneContext;
  },
): Promise<ValidationResult> {
  const parsed = parseQuickAction(args.raw);
  if (!parsed) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "invalid_quick_action", message: "Unsupported quick action." },
        { status: 400 },
      ),
    };
  }
  if (!args.scene) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "quick_action_requires_scene", message: "Quick actions need a current scene." },
        { status: 422 },
      ),
    };
  }
  if (parsed.type === "custom_scene_action") {
    return {
      action: {
        custom_text: parsed.text,
        description: `The user just did this visible action in the current scene: ${parsed.text}`,
        item_id: `custom:${parsed.text}`,
        kind: "custom_scene_action",
        label: parsed.text,
        label_zh: parsed.text,
        scene_id: args.scene.id,
        scene_mood: args.scene.mood,
        scene_name: args.scene.name,
        scene_tags: args.scene.tags,
        tone: "neutral",
      },
      ok: true,
    };
  }
  if (parsed.type === "scene_action") {
    const sceneAction = findSceneAction(args.scene.id, parsed.action_id);
    if (!sceneAction) {
      return {
        ok: false,
        response: jsonResponse(
          { error: "quick_action_unavailable", reason: "scene_action_unavailable" },
          { status: 422 },
        ),
      };
    }
    return {
      action: {
        action_id: sceneAction.id,
        description: sceneAction.description,
        item_id: sceneAction.id,
        kind: "scene_action",
        label: sceneAction.label_en,
        label_zh: sceneAction.label_zh,
        scene_id: args.scene.id,
        scene_mood: args.scene.mood,
        scene_name: args.scene.name,
        scene_tags: args.scene.tags,
        tone: sceneAction.tone,
      },
      ok: true,
    };
  }
  if (parsed.item_id === "coffee" && !isCoffeeScene(args.scene)) {
    return {
      ok: false,
      response: jsonResponse(
        { error: "quick_action_unavailable", reason: "coffee_requires_cafe" },
        { status: 422 },
      ),
    };
  }

  const cooldownUntil = await loadQuickGiftCooldownUntil(
    env,
    args.userId,
    args.companionId,
    parsed.item_id,
    args.now,
  );
  if (cooldownUntil !== null && cooldownUntil > args.now) {
    return {
      ok: false,
      response: jsonResponse(
        {
          cooldown_until: cooldownUntil,
          error: "quick_action_on_cooldown",
          item_id: parsed.item_id,
          reason: "cooldown",
        },
        { status: 422 },
      ),
    };
  }

  const label = parsed.item_id === "coffee" ? "Order coffee" : "Send flowers";
  const description = parsed.item_id === "coffee"
    ? "The user ordered coffee for both of you."
    : "The user sent flowers to you.";
  return {
    action: {
      description,
      item_id: parsed.item_id,
      kind: "gift",
      label,
      scene_id: args.scene.id,
      scene_mood: args.scene.mood,
      scene_name: args.scene.name,
      scene_tags: args.scene.tags,
      tone: "gift",
    },
    ok: true,
  };
}

export async function commitQuickAction(
  env: Env,
  args: {
    userId: string;
    companionId: string;
    action: QuickActionContext;
    now: number;
  },
): Promise<{
  activity_id: string;
  item_id: QuickActionItemId;
  unlocks: UnlockEvent[];
}> {
  const activityId = crypto.randomUUID();
  const metadata = {
    action_id: args.action.action_id ?? args.action.item_id,
    custom_action: kindForAction(args.action) === "custom_scene_action",
    custom_text: args.action.custom_text ?? null,
    item_id: args.action.item_id,
    label: args.action.label,
    label_zh: args.action.label_zh ?? null,
    quick_action: true,
    tone: toneForAction(args.action),
    type: kindForAction(args.action),
  };
  const snapshot: ActivityRecord["daily_state_snapshot"] = {
    activity_hint: args.action.label,
    availability: "available",
    mood: moodForAction(args.action),
    scene_id: args.action.scene_id,
  };

  await env.DB.prepare(
    `INSERT INTO activity_contexts
       (id, user_id, companion_id, scene_id, activity_type, status,
        daily_state_snapshot, metadata, started_at, completed_at, canceled_at)
     VALUES (?, ?, ?, ?, 'gift', 'completed', ?, ?, ?, ?, NULL)`,
  )
    .bind(
      activityId,
      args.userId,
      args.companionId,
      args.action.scene_id,
      JSON.stringify(snapshot),
      JSON.stringify(metadata),
      args.now,
      args.now,
    )
    .run();

  try {
    await onActivityCompleted(env, {
      activity_type: "gift",
      companion_id: args.companionId,
      completed_at: args.now,
      daily_state_snapshot: snapshot,
      id: activityId,
      metadata,
      scene_id: args.action.scene_id,
      user_id: args.userId,
    });
  } catch (err) {
    console.error(JSON.stringify({ message: "quick_action_memory_hook_failed", activityId, error: String(err) }));
  }

  const previousState = await loadRelationship(env, args.userId, args.companionId);
  const previousDims = previousState?.dimensions ?? { ...ZERO_DIMENSIONS };
  const newState = await applySignals(env, args.userId, args.companionId, deltaForAction(args.action), args.now);
  try {
    const unlockResult = await detectAndRecordUnlocks(
      env,
      args.userId,
      args.companionId,
      newState.dimensions,
      args.now,
    );
    const sceneUnlocks = await detectNewSceneUnlocks(env, {
      companionId: args.companionId,
      next: newState.dimensions,
      now: args.now,
      previous: previousDims,
      userId: args.userId,
    });
    return {
      activity_id: activityId,
      item_id: args.action.item_id,
      unlocks: [...unlockResult.newlyUnlocked, ...sceneUnlocks],
    };
  } catch {
    return { activity_id: activityId, item_id: args.action.item_id, unlocks: [] };
  }
}

function isCoffeeScene(scene: NonNullable<SceneContext>): boolean {
  const text = [scene.name, scene.mood, ...scene.tags].join(" ").toLowerCase();
  return text.includes("coffee") || text.includes("cafe");
}

function deltaForItem(itemId: QuickGiftItemId): Partial<DimensionValues> {
  if (itemId === "coffee") {
    return { closeness: 1, trust: 1 };
  }
  return { closeness: 1, romance: 2, tension: -1 };
}

function deltaForAction(action: QuickActionContext): Partial<DimensionValues> {
  if (kindForAction(action) === "gift") {
    return deltaForItem(action.item_id as QuickGiftItemId);
  }
  const sceneAction = action.action_id ? findSceneAction(action.scene_id, action.action_id) : null;
  return sceneAction?.delta ?? {};
}

function moodForAction(action: QuickActionContext): ActivityRecord["daily_state_snapshot"]["mood"] {
  switch (toneForAction(action)) {
    case "awkward":
    case "negative":
      return "guarded";
    case "gift":
    case "intimate":
    case "romantic":
      return "playful";
    case "neutral":
    case "positive":
      return "calm";
  }
}

function kindForAction(action: QuickActionContext): QuickActionKind {
  return action.kind ?? "gift";
}

function toneForAction(action: QuickActionContext): SceneActionTone | "gift" {
  return action.tone ?? "gift";
}

async function loadQuickGiftCooldownUntil(
  env: Env,
  userId: string,
  companionId: string,
  itemId: QuickGiftItemId,
  now: number,
): Promise<number | null> {
  const row = await env.DB.prepare(
    `SELECT started_at
     FROM activity_contexts
     WHERE user_id = ?
       AND companion_id = ?
       AND activity_type = 'gift'
       AND json_extract(metadata, '$.item_id') = ?
     ORDER BY started_at DESC
     LIMIT 1`,
  )
    .bind(userId, companionId, itemId)
    .first<{ started_at: number }>();
  const last = row?.started_at;
  if (typeof last !== "number") return null;
  return last + QUICK_GIFT_COOLDOWN_MS;
}
