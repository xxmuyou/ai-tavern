import { jsonResponse } from "../http";
import type { DimensionValues } from "../relationships/level";
import { ZERO_DIMENSIONS } from "../relationships/level";
import { applySignals, loadRelationship } from "../relationships/engine";
import { detectAndRecordUnlocks, type UnlockEvent } from "../relationships/unlocks";
import { detectNewSceneUnlocks } from "../scenes/unlock-events";

import { QUICK_GIFT_COOLDOWN_MS } from "./config";
import { onActivityCompleted } from "./memory-hooks";
import type { ActivityRecord } from "./types";

export type QuickGiftItemId = "coffee" | "flowers";

export type QuickActionForPrompt = {
  item_id: QuickGiftItemId;
  label: string;
  description: string;
};

export type QuickActionContext = QuickActionForPrompt & {
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

export function parseQuickAction(raw: unknown): { type: "gift"; item_id: QuickGiftItemId } | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type !== "gift") return null;
  if (obj.item_id !== "coffee" && obj.item_id !== "flowers") return null;
  return { item_id: obj.item_id, type: "gift" };
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
      label,
      scene_id: args.scene.id,
      scene_mood: args.scene.mood,
      scene_name: args.scene.name,
      scene_tags: args.scene.tags,
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
  item_id: QuickGiftItemId;
  unlocks: UnlockEvent[];
}> {
  const activityId = crypto.randomUUID();
  const metadata = {
    item_id: args.action.item_id,
    quick_action: true,
  };
  const snapshot: ActivityRecord["daily_state_snapshot"] = {
    activity_hint: args.action.item_id === "coffee" ? "sharing coffee" : "receiving flowers",
    availability: "available",
    mood: "calm",
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
  const newState = await applySignals(env, args.userId, args.companionId, deltaForItem(args.action.item_id), args.now);
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
      previous: previousDims,
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
