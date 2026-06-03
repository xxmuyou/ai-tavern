import { isProUser } from "../billing/entitlements";
import { requireAuthUser } from "../auth";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import type { RelationshipStage } from "../life/types";
import { RELATIONSHIP_STAGES } from "../life/types";
import { LLMRouterError, llmCall } from "../llm";
import { LLMError } from "../llm/types";
import { ZERO_DIMENSIONS } from "../relationships/level";
import { loadRelationship } from "../relationships/engine";
import { deriveStage } from "../relationships/stage";
import { STAGE_RANK } from "../relationships/unlocks";

export type StoryBeatStatus = "active" | "waiting_stage" | "completed";
export type StoryArcSourceType = "official_seed" | "template" | "user_written" | "ai_assisted";
export type StoryBeatCompletionMode = "manual" | "auto";

export type StoryBeatPublic = {
  id: string;
  title: string;
  beat_order: number;
  stage_gate: RelationshipStage;
  scene_id: string | null;
  opener: string;
  objective: string;
  reward_unlock_key: string | null;
  status: StoryBeatStatus;
  arc_id?: string | null;
  completion_mode?: StoryBeatCompletionMode;
  is_user_editable?: boolean;
  source_type?: StoryArcSourceType;
};

export type StoryArcPublic = {
  id: string;
  companion_id: string;
  owner_user_id: string | null;
  title: string;
  source_type: StoryArcSourceType;
  template_id: string | null;
  outline: string | null;
  is_active: boolean;
  shared_with_public: boolean;
  created_at: number;
  updated_at: number;
  beats: StoryBeatPublic[];
};

export type StoryArcTemplatePublic = {
  id: string;
  title: string;
  relationship_role: string | null;
  description: string;
  beats: StoryBeatDraft[];
};

export type StoryBeatDraft = {
  title: string;
  stage_gate: RelationshipStage;
  scene_id: string | null;
  scene_hint: string | null;
  opener: string;
  objective: string;
};

type CompanionStoryContext = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
  is_public: number;
  name: string;
  appearance: string | null;
  personality: string | null;
  background: string | null;
  speech_style: string | null;
  relationship_role: string | null;
  want: string | null;
  secret: string | null;
  boundary: string | null;
  preferred_scenes: string | null;
};

type StoryBeatRow = {
  id: string;
  companion_id: string;
  arc_id?: string | null;
  created_by_user_id?: string | null;
  beat_order: number;
  title: string;
  stage_gate: string;
  scene_id: string | null;
  opener: string;
  objective: string;
  reward_unlock_key: string | null;
  source_type?: string | null;
  is_user_editable?: number | null;
  completion_mode?: string | null;
};

type StoryProgressRow = {
  completed_beat_ids: string | null;
};

type StoryArcRow = {
  id: string;
  companion_id: string;
  owner_user_id: string | null;
  title: string;
  source_type: string;
  template_id: string | null;
  outline: string | null;
  is_active: number;
  shared_with_public: number;
  created_at: number;
  updated_at: number;
};

type StoryTemplateRow = {
  id: string;
  title: string;
  relationship_role: string | null;
  description: string;
  beat_blueprint: string;
};

const TEXT_MAX = 220;
const TITLE_MAX = 80;
const OUTLINE_MAX = 600;
const MIN_BEATS = 3;
const MAX_BEATS = 5;
const POSITIVE_STAGES = new Set<RelationshipStage>([
  "first_contact",
  "familiar",
  "trusted",
  "close_friend",
  "romantic_tension",
  "dating",
  "committed",
]);

export async function loadStoryBeatForScene(
  env: Env,
  userId: string,
  companionId: string,
  sceneId: string | null,
): Promise<StoryBeatPublic | null> {
  const [beats, completed, stage] = await Promise.all([
    loadVisibleBeats(env, userId, companionId),
    loadCompletedBeatIds(env, userId, companionId),
    loadCurrentStage(env, userId, companionId),
  ]);

  if (beats.length === 0) {
    return null;
  }

  const nextBeat = beats.find((beat) => !completed.has(beat.id));
  if (!nextBeat) {
    return null;
  }

  if (nextBeat.scene_id && nextBeat.scene_id !== sceneId) {
    return null;
  }

  if (!stageMeets(stage, nextBeat.stage_gate)) {
    return toPublicBeat(nextBeat, "waiting_stage");
  }

  return toPublicBeat(nextBeat, "active");
}

export async function completeCurrentStoryBeat(
  env: Env,
  userId: string,
  companionId: string,
  sceneId: string | null,
  now: number,
): Promise<StoryBeatPublic | null> {
  const beat = await loadStoryBeatForScene(env, userId, companionId, sceneId);
  if (!beat || beat.status !== "active") {
    return null;
  }
  if (beat.completion_mode === "manual") {
    return null;
  }
  return markStoryBeatComplete(env, userId, companionId, beat.id, now);
}

export async function markStoryBeatComplete(
  env: Env,
  userId: string,
  companionId: string,
  beatId: string,
  now: number,
): Promise<StoryBeatPublic | null> {
  const beat = await loadVisibleBeatById(env, userId, companionId, beatId);
  if (!beat) {
    return null;
  }

  const stage = await loadCurrentStage(env, userId, companionId);
  if (!stageMeets(stage, beat.stage_gate)) {
    return toPublicBeat(beat, "waiting_stage");
  }

  const completed = await loadCompletedBeatIds(env, userId, companionId);
  if (completed.has(beat.id)) {
    return toPublicBeat(beat, "completed");
  }
  completed.add(beat.id);

  await saveCompletedBeatIds(env, userId, companionId, beat.id, completed, now);

  if (beat.reward_unlock_key) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO relationship_unlocks (user_id, companion_id, unlock_key, unlocked_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(userId, companionId, beat.reward_unlock_key, now)
      .run();
  }

  return toPublicBeat(beat, "completed");
}

export async function reopenStoryBeat(
  env: Env,
  userId: string,
  companionId: string,
  beatId: string,
  now: number,
): Promise<StoryBeatPublic | null> {
  const beat = await loadVisibleBeatById(env, userId, companionId, beatId);
  if (!beat) {
    return null;
  }

  const completed = await loadCompletedBeatIds(env, userId, companionId);
  completed.delete(beat.id);
  await saveCompletedBeatIds(env, userId, companionId, beat.id, completed, now);

  const stage = await loadCurrentStage(env, userId, companionId);
  return toPublicBeat(beat, stageMeets(stage, beat.stage_gate) ? "active" : "waiting_stage");
}

export async function listStoryArcTemplates(env: Env): Promise<StoryArcTemplatePublic[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, title, relationship_role, description, beat_blueprint
     FROM story_arc_templates
     WHERE is_active = 1
     ORDER BY title ASC, id ASC`,
  ).all<StoryTemplateRow>();

  return (results ?? []).map(serializeTemplate);
}

export async function handleStoryTemplatesRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== "/story-arc-templates") {
    return null;
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  await requireAuthUser(env, request);
  return jsonResponse({ templates: await listStoryArcTemplates(env) });
}

export async function handleCompanionStoryRequest(
  request: Request,
  env: Env,
  user: UserRecord,
  companionId: string,
  suffix: string,
): Promise<Response | null> {
  if (suffix === "/story-arcs") {
    if (request.method === "GET") {
      return listCompanionStoryArcs(env, user, companionId);
    }
    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      return createStoryArc(env, user, companionId, body);
    }
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  if (suffix === "/story-arcs/from-template") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const body = await request.json().catch(() => null);
    return createStoryArcFromTemplate(env, user, companionId, body);
  }

  if (suffix === "/story-arcs/assist") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const body = await request.json().catch(() => null);
    return assistStoryArcDraft(env, user, companionId, body);
  }

  const beatMatch = suffix.match(/^\/story-beats\/([^/]+)$/);
  if (beatMatch) {
    if (request.method !== "PUT") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const beatId = decodeURIComponent(beatMatch[1] ?? "");
    if (!beatId) {
      return jsonResponse({ error: "invalid_beat_id" }, { status: 400 });
    }
    const body = await request.json().catch(() => null);
    return updateStoryBeat(env, user, companionId, beatId, body);
  }

  const completeMatch = suffix.match(/^\/story-beats\/([^/]+)\/complete$/);
  if (completeMatch) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const beatId = decodeURIComponent(completeMatch[1] ?? "");
    if (!beatId) {
      return jsonResponse({ error: "invalid_beat_id" }, { status: 400 });
    }
    const companion = await loadCompanionStoryContext(env, companionId);
    if (!companion || !canReadCompanion(companion, user)) return notFound();
    const beat = await markStoryBeatComplete(env, user.id, companionId, beatId, Date.now());
    if (!beat) return notFound();
    return jsonResponse({ beat });
  }

  const reopenMatch = suffix.match(/^\/story-beats\/([^/]+)\/reopen$/);
  if (reopenMatch) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    const beatId = decodeURIComponent(reopenMatch[1] ?? "");
    if (!beatId) {
      return jsonResponse({ error: "invalid_beat_id" }, { status: 400 });
    }
    const companion = await loadCompanionStoryContext(env, companionId);
    if (!companion || !canReadCompanion(companion, user)) return notFound();
    const beat = await reopenStoryBeat(env, user.id, companionId, beatId, Date.now());
    if (!beat) return notFound();
    return jsonResponse({ beat });
  }

  return null;
}

async function listCompanionStoryArcs(
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<Response> {
  const companion = await loadCompanionStoryContext(env, companionId);
  if (!companion || !canReadCompanion(companion, user)) {
    return notFound();
  }

  const rows = await loadVisibleArcs(env, user.id, companionId);
  const completed = await loadCompletedBeatIds(env, user.id, companionId);
  const stage = await loadCurrentStage(env, user.id, companionId);
  const arcs = await Promise.all(
    rows.map(async (arc) => {
      const beats = await loadBeatsForArc(env, arc.id);
      return toPublicArc(arc, beats, completed, stage);
    }),
  );

  return jsonResponse({ arcs });
}

async function createStoryArcFromTemplate(
  env: Env,
  user: UserRecord,
  companionId: string,
  body: unknown,
): Promise<Response> {
  const companion = await loadOwnedUserCompanion(env, user, companionId);
  if (companion instanceof Response) return companion;

  const raw = readObject(body);
  if (!raw) return jsonResponse({ error: "invalid_body" }, { status: 400 });
  const templateId = readString(raw.template_id, 80);
  if (!templateId) {
    return jsonResponse({ error: "template_id_required" }, { status: 400 });
  }

  const template = await loadTemplate(env, templateId);
  if (!template) {
    return jsonResponse({ error: "template_not_found" }, { status: 404 });
  }

  const title = readString(raw.title, TITLE_MAX) || template.title;
  const beats = normalizeDraftBeats(parseTemplateBeats(template.beat_blueprint), { requireCount: false });
  if (beats.length === 0) {
    return jsonResponse({ error: "template_invalid" }, { status: 500 });
  }

  const arc = await insertStoryArcWithBeats(env, {
    beats,
    companionId: companion.id,
    outline: null,
    ownerUserId: user.id,
    sourceType: "template",
    templateId,
    title,
  });

  return jsonResponse({ arc }, { status: 201 });
}

async function createStoryArc(
  env: Env,
  user: UserRecord,
  companionId: string,
  body: unknown,
): Promise<Response> {
  const companion = await loadOwnedUserCompanion(env, user, companionId);
  if (companion instanceof Response) return companion;

  const raw = readObject(body);
  if (!raw) return jsonResponse({ error: "invalid_body" }, { status: 400 });
  const title = readString(raw.title, TITLE_MAX);
  if (!title) {
    return jsonResponse({ error: "title_required" }, { status: 400 });
  }

  const sourceTypeRaw = readString(raw.source_type, 40) ?? "user_written";
  const sourceType: StoryArcSourceType =
    sourceTypeRaw === "ai_assisted" ? "ai_assisted" : "user_written";
  const outline = readString(raw.outline, OUTLINE_MAX);
  const beatsRaw = Array.isArray(raw.beats) ? raw.beats : null;
  if (!beatsRaw) {
    return jsonResponse({ error: "beats_required" }, { status: 400 });
  }

  const beats = normalizeDraftBeats(beatsRaw, { requireCount: true });
  if (beats.length < MIN_BEATS || beats.length > MAX_BEATS) {
    return jsonResponse({ error: "invalid_beats_count", min: MIN_BEATS, max: MAX_BEATS }, { status: 400 });
  }

  const arc = await insertStoryArcWithBeats(env, {
    beats,
    companionId: companion.id,
    outline,
    ownerUserId: user.id,
    sourceType,
    templateId: readString(raw.template_id, 80),
    title,
  });

  return jsonResponse({ arc }, { status: 201 });
}

async function assistStoryArcDraft(
  env: Env,
  user: UserRecord,
  companionId: string,
  body: unknown,
): Promise<Response> {
  const companion = await loadOwnedUserCompanion(env, user, companionId);
  if (companion instanceof Response) return companion;

  if (!(await isProUser(env, user.id))) {
    return jsonResponse({ error: "pro_required", feature: "story_beat_assist" }, { status: 402 });
  }

  const raw = readObject(body);
  if (!raw) return jsonResponse({ error: "invalid_body" }, { status: 400 });

  const outline = readString(raw.outline, OUTLINE_MAX);
  const templateId = readString(raw.template_id, 80);
  const targetCount = readInt(raw.beat_count, 4);
  if (targetCount < MIN_BEATS || targetCount > MAX_BEATS) {
    return jsonResponse({ error: "invalid_beat_count", min: MIN_BEATS, max: MAX_BEATS }, { status: 400 });
  }
  if (!outline && !templateId) {
    return jsonResponse({ error: "outline_or_template_required" }, { status: 400 });
  }

  const template = templateId ? await loadTemplate(env, templateId) : null;
  if (templateId && !template) {
    return jsonResponse({ error: "template_not_found" }, { status: 404 });
  }

  try {
    const response = await llmCall(
      env,
      {
        task: "story_beat_assist",
        temperature: 0.45,
        max_tokens: 900,
        json_schema: storyAssistSchema(),
        messages: [
          {
            role: "system",
            content:
              "You draft lightweight story beats for an AI chat relationship game. Return valid JSON only. Do not write explicit sexual content, illegal content, or underage romance/sexual content. Do not reveal the character secret directly; use it only as future tension. Keep openers and objectives short and playable.",
          },
          {
            role: "user",
            content: buildAssistPrompt(companion, {
              beatCount: targetCount,
              outline,
              template,
            }),
          },
        ],
      },
      { user_id: user.id },
    );
    const draft = parseAssistDraft(response.structured ?? response.text);
    if (!draft) {
      return jsonResponse({ error: "invalid_assist_output" }, { status: 502 });
    }
    return jsonResponse({
      draft: {
        arc_title: draft.arc_title,
        beats: draft.beats,
        outline: outline ?? null,
        source_type: "ai_assisted",
        template_id: templateId ?? null,
      },
    });
  } catch (err) {
    if (err instanceof LLMError || err instanceof LLMRouterError) {
      return jsonResponse({ error: "assist_unavailable" }, { status: 502 });
    }
    throw err;
  }
}

async function updateStoryBeat(
  env: Env,
  user: UserRecord,
  companionId: string,
  beatId: string,
  body: unknown,
): Promise<Response> {
  const companion = await loadOwnedUserCompanion(env, user, companionId);
  if (companion instanceof Response) return companion;

  const existing = await loadEditableBeat(env, user.id, companionId, beatId);
  if (!existing) return notFound();

  const raw = readObject(body);
  if (!raw) return jsonResponse({ error: "invalid_body" }, { status: 400 });

  const patch = {
    beat_order: "beat_order" in raw ? readInt(raw.beat_order, existing.beat_order) : existing.beat_order,
    objective: "objective" in raw ? readString(raw.objective, TEXT_MAX) : existing.objective,
    opener: "opener" in raw ? readString(raw.opener, TEXT_MAX) : existing.opener,
    scene_id: "scene_id" in raw ? readNullableString(raw.scene_id, 80) : existing.scene_id,
    stage_gate: "stage_gate" in raw ? readStage(raw.stage_gate) : existing.stage_gate,
    title: "title" in raw ? readString(raw.title, TITLE_MAX) : existing.title,
  };

  if (!patch.title || !patch.opener || !patch.objective || !patch.stage_gate) {
    return jsonResponse({ error: "invalid_beat" }, { status: 400 });
  }

  await env.DB.prepare(
    `UPDATE companion_story_beats
     SET beat_order = ?, title = ?, stage_gate = ?, scene_id = ?, opener = ?, objective = ?
     WHERE id = ? AND companion_id = ? AND created_by_user_id = ? AND is_user_editable = 1`,
  )
    .bind(
      Math.max(1, patch.beat_order),
      patch.title,
      patch.stage_gate,
      patch.scene_id,
      patch.opener,
      patch.objective,
      beatId,
      companionId,
      user.id,
    )
    .run();

  const updated = await loadVisibleBeatById(env, user.id, companionId, beatId);
  if (!updated) return notFound();
  return jsonResponse({ beat: toPublicBeat(updated, "active") });
}

async function insertStoryArcWithBeats(
  env: Env,
  input: {
    beats: StoryBeatDraft[];
    companionId: string;
    ownerUserId: string;
    outline: string | null | undefined;
    sourceType: StoryArcSourceType;
    templateId: string | null | undefined;
    title: string;
  },
): Promise<StoryArcPublic> {
  const now = Date.now();
  const arcId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO companion_story_arcs
       (id, companion_id, owner_user_id, title, source_type, template_id, outline,
        is_active, shared_with_public, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
  )
    .bind(
      arcId,
      input.companionId,
      input.ownerUserId,
      input.title,
      input.sourceType,
      input.templateId ?? null,
      input.outline ?? null,
      now,
      now,
    )
    .run();

  const insertBeat = env.DB.prepare(
    `INSERT INTO companion_story_beats
       (id, companion_id, arc_id, created_by_user_id, beat_order, title, stage_gate,
        scene_id, opener, objective, reward_unlock_key, source_type, is_user_editable,
        completion_mode, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, 'manual', 1, ?)`,
  );

  await env.DB.batch(
    input.beats.map((beat, index) =>
      insertBeat.bind(
        crypto.randomUUID(),
        input.companionId,
        arcId,
        input.ownerUserId,
        index + 1,
        beat.title,
        beat.stage_gate,
        beat.scene_id,
        beat.opener,
        beat.objective,
        input.sourceType,
        now,
      ),
    ),
  );

  const arc = await loadArcById(env, arcId);
  const rows = await loadBeatsForArc(env, arcId);
  return toPublicArc(arc!, rows, new Set(), "first_contact");
}

async function loadVisibleBeats(env: Env, userId: string, companionId: string): Promise<StoryBeatRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT b.id, b.companion_id, b.arc_id, b.created_by_user_id, b.beat_order,
            b.title, b.stage_gate, b.scene_id, b.opener, b.objective,
            b.reward_unlock_key, b.source_type, b.is_user_editable, b.completion_mode
     FROM companion_story_beats b
     LEFT JOIN companion_story_arcs a ON a.id = b.arc_id
     LEFT JOIN companions c ON c.id = b.companion_id
     WHERE b.companion_id = ?
       AND b.is_active = 1
       AND (
         a.id IS NULL
         OR a.source_type = 'official_seed'
         OR a.owner_user_id = ?
         OR (a.shared_with_public = 1 AND c.is_public = 1)
       )
     ORDER BY COALESCE(a.created_at, b.created_at) ASC, b.beat_order ASC, b.id ASC`,
  )
    .bind(companionId, userId)
    .all<StoryBeatRow>();
  return results ?? [];
}

async function loadVisibleBeatById(
  env: Env,
  userId: string,
  companionId: string,
  beatId: string,
): Promise<StoryBeatRow | null> {
  return env.DB.prepare(
    `SELECT b.id, b.companion_id, b.arc_id, b.created_by_user_id, b.beat_order,
            b.title, b.stage_gate, b.scene_id, b.opener, b.objective,
            b.reward_unlock_key, b.source_type, b.is_user_editable, b.completion_mode
     FROM companion_story_beats b
     LEFT JOIN companion_story_arcs a ON a.id = b.arc_id
     LEFT JOIN companions c ON c.id = b.companion_id
     WHERE b.id = ? AND b.companion_id = ? AND b.is_active = 1
       AND (
         a.id IS NULL
         OR a.source_type = 'official_seed'
         OR a.owner_user_id = ?
         OR (a.shared_with_public = 1 AND c.is_public = 1)
       )`,
  )
    .bind(beatId, companionId, userId)
    .first<StoryBeatRow>();
}

async function loadEditableBeat(
  env: Env,
  userId: string,
  companionId: string,
  beatId: string,
): Promise<StoryBeatRow | null> {
  return env.DB.prepare(
    `SELECT id, companion_id, arc_id, created_by_user_id, beat_order, title,
            stage_gate, scene_id, opener, objective, reward_unlock_key,
            source_type, is_user_editable, completion_mode
     FROM companion_story_beats
     WHERE id = ? AND companion_id = ? AND created_by_user_id = ?
       AND is_user_editable = 1 AND is_active = 1`,
  )
    .bind(beatId, companionId, userId)
    .first<StoryBeatRow>();
}

async function loadBeatsForArc(env: Env, arcId: string): Promise<StoryBeatRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, companion_id, arc_id, created_by_user_id, beat_order, title,
            stage_gate, scene_id, opener, objective, reward_unlock_key,
            source_type, is_user_editable, completion_mode
     FROM companion_story_beats
     WHERE arc_id = ? AND is_active = 1
     ORDER BY beat_order ASC, id ASC`,
  )
    .bind(arcId)
    .all<StoryBeatRow>();
  return results ?? [];
}

async function loadVisibleArcs(env: Env, userId: string, companionId: string): Promise<StoryArcRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.companion_id, a.owner_user_id, a.title, a.source_type,
            a.template_id, a.outline, a.is_active, a.shared_with_public,
            a.created_at, a.updated_at
     FROM companion_story_arcs a
     LEFT JOIN companions c ON c.id = a.companion_id
     WHERE a.companion_id = ? AND a.is_active = 1
       AND (
         a.source_type = 'official_seed'
         OR a.owner_user_id = ?
         OR (a.shared_with_public = 1 AND c.is_public = 1)
       )
     ORDER BY a.created_at ASC, a.id ASC`,
  )
    .bind(companionId, userId)
    .all<StoryArcRow>();
  return results ?? [];
}

async function loadArcById(env: Env, arcId: string): Promise<StoryArcRow | null> {
  return env.DB.prepare(
    `SELECT id, companion_id, owner_user_id, title, source_type, template_id,
            outline, is_active, shared_with_public, created_at, updated_at
     FROM companion_story_arcs
     WHERE id = ?`,
  )
    .bind(arcId)
    .first<StoryArcRow>();
}

async function loadTemplate(env: Env, templateId: string): Promise<StoryTemplateRow | null> {
  return env.DB.prepare(
    `SELECT id, title, relationship_role, description, beat_blueprint
     FROM story_arc_templates
     WHERE id = ? AND is_active = 1`,
  )
    .bind(templateId)
    .first<StoryTemplateRow>();
}

async function loadCompanionStoryContext(
  env: Env,
  companionId: string,
): Promise<CompanionStoryContext | null> {
  return env.DB.prepare(
    `SELECT id, source, created_by, is_active, is_public, name, appearance,
            personality, background, speech_style, relationship_role, want,
            secret, boundary, preferred_scenes
     FROM companions
     WHERE id = ?`,
  )
    .bind(companionId)
    .first<CompanionStoryContext>();
}

async function loadOwnedUserCompanion(
  env: Env,
  user: UserRecord,
  companionId: string,
): Promise<CompanionStoryContext | Response> {
  const companion = await loadCompanionStoryContext(env, companionId);
  if (!companion) return notFound();
  if (companion.source !== "user") {
    return jsonResponse({ error: "forbidden_official" }, { status: 403 });
  }
  if (companion.created_by !== user.id) {
    return jsonResponse({ error: "forbidden_not_owner" }, { status: 403 });
  }
  if (companion.is_active !== 1) {
    return notFound();
  }
  return companion;
}

async function loadCompletedBeatIds(env: Env, userId: string, companionId: string): Promise<Set<string>> {
  const row = await env.DB.prepare(
    `SELECT completed_beat_ids
     FROM user_story_progress
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<StoryProgressRow>();
  return parseCompletedBeatIds(row?.completed_beat_ids);
}

async function saveCompletedBeatIds(
  env: Env,
  userId: string,
  companionId: string,
  currentBeatId: string,
  completed: Set<string>,
  now: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_story_progress
       (user_id, companion_id, current_beat_id, completed_beat_ids, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, companion_id) DO UPDATE SET
       current_beat_id = excluded.current_beat_id,
       completed_beat_ids = excluded.completed_beat_ids,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, companionId, currentBeatId, JSON.stringify([...completed]), now)
    .run();
}

async function loadCurrentStage(env: Env, userId: string, companionId: string): Promise<RelationshipStage> {
  const relationship = await loadRelationship(env, userId, companionId);
  return deriveStage(relationship?.dimensions ?? { ...ZERO_DIMENSIONS }).stage;
}

function parseCompletedBeatIds(raw: string | null | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function stageMeets(current: RelationshipStage, required: string): required is RelationshipStage {
  const currentRank = STAGE_RANK[current];
  const requiredRank = STAGE_RANK[required];
  return currentRank !== undefined && requiredRank !== undefined && currentRank >= requiredRank;
}

function toPublicBeat(row: StoryBeatRow, status: StoryBeatStatus): StoryBeatPublic {
  return {
    arc_id: row.arc_id ?? null,
    beat_order: row.beat_order,
    completion_mode: normalizeCompletionMode(row.completion_mode),
    id: row.id,
    is_user_editable: row.is_user_editable === 1,
    objective: row.objective,
    opener: row.opener,
    reward_unlock_key: row.reward_unlock_key,
    scene_id: row.scene_id,
    source_type: normalizeSourceType(row.source_type),
    stage_gate: readStage(row.stage_gate) ?? "first_contact",
    status,
    title: row.title,
  };
}

function toPublicArc(
  row: StoryArcRow,
  beats: StoryBeatRow[],
  completed: Set<string>,
  stage: RelationshipStage,
): StoryArcPublic {
  const nextOpenBeatId = beats.find((beat) => !completed.has(beat.id))?.id ?? null;
  return {
    beats: beats.map((beat) => {
      let status: StoryBeatStatus = "waiting_stage";
      if (completed.has(beat.id)) {
        status = "completed";
      } else if (beat.id === nextOpenBeatId && stageMeets(stage, beat.stage_gate)) {
        status = "active";
      }
      return toPublicBeat(beat, status);
    }),
    companion_id: row.companion_id,
    created_at: row.created_at,
    id: row.id,
    is_active: row.is_active === 1,
    outline: row.outline,
    owner_user_id: row.owner_user_id,
    shared_with_public: row.shared_with_public === 1,
    source_type: normalizeSourceType(row.source_type),
    template_id: row.template_id,
    title: row.title,
    updated_at: row.updated_at,
  };
}

function serializeTemplate(row: StoryTemplateRow): StoryArcTemplatePublic {
  return {
    beats: normalizeDraftBeats(parseTemplateBeats(row.beat_blueprint), { requireCount: false }),
    description: row.description,
    id: row.id,
    relationship_role: row.relationship_role,
    title: row.title,
  };
}

function parseTemplateBeats(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDraftBeats(rawBeats: unknown[], options: { requireCount: boolean }): StoryBeatDraft[] {
  const max = options.requireCount ? MAX_BEATS : 12;
  return rawBeats
    .slice(0, max)
    .map((item) => {
      const raw = readObject(item);
      if (!raw) return null;
      const title = readString(raw.title, TITLE_MAX);
      const stageGate = readStage(raw.stage_gate);
      const opener = readString(raw.opener, TEXT_MAX);
      const objective = readString(raw.objective, TEXT_MAX);
      if (!title || !stageGate || !opener || !objective) return null;
      return {
        objective,
        opener,
        scene_hint: readString(raw.scene_hint, 80),
        scene_id: readNullableString(raw.scene_id, 80),
        stage_gate: stageGate,
        title,
      };
    })
    .filter((beat): beat is StoryBeatDraft => Boolean(beat));
}

function readObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function readNullableString(value: unknown, max: number): string | null {
  if (value === null) return null;
  return readString(value, max);
}

function readInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readStage(value: unknown): RelationshipStage | null {
  if (typeof value !== "string") return null;
  return (RELATIONSHIP_STAGES as ReadonlyArray<string>).includes(value) && POSITIVE_STAGES.has(value as RelationshipStage)
    ? value as RelationshipStage
    : null;
}

function normalizeSourceType(value: string | null | undefined): StoryArcSourceType {
  if (value === "template" || value === "user_written" || value === "ai_assisted") {
    return value;
  }
  return "official_seed";
}

function normalizeCompletionMode(value: string | null | undefined): StoryBeatCompletionMode {
  return value === "auto" ? "auto" : "manual";
}

function canReadCompanion(companion: CompanionStoryContext, user: UserRecord): boolean {
  if (companion.is_active !== 1) return false;
  if (companion.source === "official") return true;
  if (companion.is_public === 1) return true;
  return companion.created_by === user.id;
}

function buildAssistPrompt(
  companion: CompanionStoryContext,
  input: {
    beatCount: number;
    outline: string | null;
    template: StoryTemplateRow | null;
  },
): string {
  const template = input.template ? serializeTemplate(input.template) : null;
  return [
    `Companion name: ${companion.name}`,
    `Relationship role: ${companion.relationship_role ?? "friend"}`,
    `Appearance: ${companion.appearance ?? "(unspecified)"}`,
    `Personality: ${companion.personality ?? "(unspecified)"}`,
    `Background: ${companion.background ?? "(unspecified)"}`,
    `Want: ${companion.want ?? "(unspecified)"}`,
    `Secret, for hidden long-term tension only: ${companion.secret ?? "(unspecified)"}`,
    `Boundary: ${companion.boundary ?? "(unspecified)"}`,
    `Speech style: ${companion.speech_style ?? "(unspecified)"}`,
    `Target beats: ${input.beatCount}`,
    input.outline ? `User outline: ${input.outline}` : "",
    template ? `Story pack: ${template.title}\nPack description: ${template.description}\nBlueprint: ${JSON.stringify(template.beats)}` : "",
    "Return JSON with arc_title and beats. Each beat needs title, stage_gate, scene_hint, opener, objective.",
  ].filter(Boolean).join("\n");
}

function storyAssistSchema(): Record<string, unknown> {
  return {
    additionalProperties: false,
    properties: {
      arc_title: { type: "string" },
      beats: {
        items: {
          additionalProperties: false,
          properties: {
            objective: { type: "string" },
            opener: { type: "string" },
            scene_hint: { type: "string" },
            stage_gate: {
              enum: ["first_contact", "familiar", "trusted", "close_friend", "romantic_tension", "dating", "committed"],
              type: "string",
            },
            title: { type: "string" },
          },
          required: ["title", "stage_gate", "scene_hint", "opener", "objective"],
          type: "object",
        },
        maxItems: MAX_BEATS,
        minItems: MIN_BEATS,
        type: "array",
      },
    },
    required: ["arc_title", "beats"],
    type: "object",
  };
}

function parseAssistDraft(value: unknown): { arc_title: string; beats: StoryBeatDraft[] } | null {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(stripJsonFence(value)) as unknown;
    } catch {
      return null;
    }
  }
  const raw = readObject(parsed);
  if (!raw) return null;
  const arcTitle = readString(raw.arc_title, TITLE_MAX);
  const rawBeats = Array.isArray(raw.beats) ? raw.beats : [];
  const beats = normalizeDraftBeats(rawBeats, { requireCount: true });
  if (!arcTitle || beats.length < MIN_BEATS || beats.length > MAX_BEATS) return null;
  return { arc_title: arcTitle, beats };
}

function stripJsonFence(value: string): string {
  return value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}
