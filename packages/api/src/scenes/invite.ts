// spec-036: in-chat "invite to go somewhere" targets.
//
// The candidate destinations for an in-chat invitation are the scenes where
// THIS companion can appear (its id is in `default_companions`) AND which the
// user has already unlocked (`unlock_condition` passes). Intimate scenes gated
// by a high relationship `unlock_condition` simply never show up until earned —
// that is how "you can't invite her to the hotel when you barely know her" is
// enforced, for free, by the existing unlock system.

import { requireAuthUser } from "../auth";
import { jsonResponse, notFound } from "../http";
import { evaluateUnlock } from "./unlock";

export type InviteTarget = {
  id: string;
  name: string;
  mood: string;
  art_url: string | null;
};

type SceneCandidateRow = {
  id: string;
  name: string;
  mood: string;
  art_url: string | null;
  default_companions: string | null;
  unlock_condition: string | null;
};

function parseCompanionIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

async function loadCandidateScenes(env: Env, companionId: string): Promise<SceneCandidateRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, mood, art_url, default_companions, unlock_condition
     FROM scenes
     WHERE is_active = 1
     ORDER BY display_order ASC, id ASC`,
  ).all<SceneCandidateRow>();

  return (results ?? []).filter((row) => parseCompanionIds(row.default_companions).includes(companionId));
}

/**
 * Scenes this companion appears in that the user has unlocked, minus the scene
 * they are currently in (`fromSceneId`). Used to populate the invite popup.
 */
export async function loadInviteTargets(
  env: Env,
  userId: string,
  companionId: string,
  fromSceneId: string | null,
): Promise<InviteTarget[]> {
  const candidates = await loadCandidateScenes(env, companionId);
  const out: InviteTarget[] = [];
  for (const row of candidates) {
    if (fromSceneId && row.id === fromSceneId) continue;
    const { unlocked } = await evaluateUnlock(env, userId, row.unlock_condition);
    if (!unlocked) continue;
    out.push({ art_url: row.art_url, id: row.id, mood: row.mood, name: row.name });
  }
  return out;
}

/**
 * Validate that `sceneId` is a legitimate invite target for this companion/user
 * (appears in the scene, scene active, unlocked). Returns the resolved target or
 * null. Used by the chat POST path to gate `invite_scene_id`.
 */
export async function resolveInviteTarget(
  env: Env,
  userId: string,
  companionId: string,
  sceneId: string,
): Promise<InviteTarget | null> {
  const candidates = await loadCandidateScenes(env, companionId);
  const row = candidates.find((c) => c.id === sceneId);
  if (!row) return null;
  const { unlocked } = await evaluateUnlock(env, userId, row.unlock_condition);
  if (!unlocked) return null;
  return { art_url: row.art_url, id: row.id, mood: row.mood, name: row.name };
}

type CompanionVisibilityRow = {
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
};

/**
 * Route: `GET /companions/{companion_id}/invite-targets?from_scene_id=...`
 * Returns null when the path does not match so the companions dispatcher can
 * fall through to its other routes.
 */
export async function handleInviteTargetsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const match = pathname.match(/^\/companions\/([^/]+)\/invite-targets$/);
  if (!match) {
    return null;
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const companionId = decodeURIComponent(match[1] ?? "");
  if (!companionId) {
    return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
  }

  const user = await requireAuthUser(env, request);

  const companion = await env.DB.prepare(
    `SELECT source, created_by, is_active FROM companions WHERE id = ?`,
  )
    .bind(companionId)
    .first<CompanionVisibilityRow>();
  if (!companion || companion.is_active === 0) {
    return notFound();
  }
  if (companion.source === "user" && companion.created_by !== user.id) {
    return notFound();
  }

  const url = new URL(request.url);
  const fromSceneId = url.searchParams.get("from_scene_id");
  const targets = await loadInviteTargets(env, user.id, companionId, fromSceneId);
  return jsonResponse({ targets });
}
