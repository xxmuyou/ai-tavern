import { isAdminUser, requireAuthUser } from "../auth";
import {
  commitReservation,
  releaseReservation,
  reserveCredits,
} from "../credits";
import { TASK_CREDIT_COST } from "../credits/pricing";
import { CreditsError } from "../credits/types";
import { jsonResponse, notFound, readJson } from "../http";
import type { UserRecord } from "../identity";
import { llmCall, type LLMMessage } from "../llm";
import {
  canChatWithCompanion,
  loadCompanionForChat,
} from "../chat/loaders";
import { evaluateUserSceneUnlock } from "./unlock";

const TITLE_MAX = 100;
const SYNOPSIS_MAX = 600;
const OBJECTIVE_MAX = 500;
const GUIDANCE_MAX = 900;
const HINT_MAX = 360;
const MAX_TASKS = 8;

export type SceneStorySourceType = "official_preset" | "user_written" | "ai_assisted";
export type SceneStoryTaskStatus = "locked" | "active" | "completed";

export type SceneStoryTaskPublic = {
  id: string;
  order: number;
  title: string;
  objective: string;
  ai_guidance: string;
  completion_hint: string | null;
  status: SceneStoryTaskStatus;
};

export type SceneStoryPublic = {
  id: string;
  scene_id: string;
  title: string;
  synopsis: string | null;
  source_type: SceneStorySourceType;
  can_edit: boolean;
  task_count: number;
  progress_percent: number;
  current_task: SceneStoryTaskPublic | null;
  tasks?: SceneStoryTaskPublic[];
};

export type SceneStoryPromptContext = {
  story: {
    id: string;
    title: string;
    synopsis: string | null;
    progress_percent: number;
  };
  task: {
    id: string;
    order: number;
    title: string;
    objective: string;
    ai_guidance: string;
    completion_hint: string | null;
  } | null;
};

type SceneRow = {
  id: string;
  name: string;
  mood: string;
  unlock_condition: string | null;
};

type SceneStoryRow = {
  id: string;
  scene_id: string;
  owner_user_id: string | null;
  title: string;
  synopsis: string | null;
  source_type: string;
  is_active: number;
  created_at: number;
  updated_at: number;
};

type SceneStoryTaskRow = {
  id: string;
  story_id: string;
  task_order: number;
  title: string;
  objective: string;
  ai_guidance: string;
  completion_hint: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
};

type ProgressRow = {
  current_task_id: string | null;
  completed_task_ids: string | null;
};

type InviteCompanionRow = {
  id: string;
  name: string;
  source: "official" | "user";
  relationship_role: string | null;
  art_url: string | null;
  level_label: string | null;
};

export async function handleSceneStoryRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const listMatch = pathname.match(/^\/scenes\/([^/]+)\/stories$/);
  if (listMatch) {
    const sceneId = decodeURIComponent(listMatch[1] ?? "");
    if (!sceneId) return jsonResponse({ error: "invalid_scene_id" }, { status: 400 });
    const user = await requireAuthUser(env, request);
    if (request.method === "GET") return listSceneStories(request, env, user, sceneId);
    if (request.method === "POST") {
      const body = await readJson<unknown>(request).catch(() => null);
      return createSceneStory(env, user, sceneId, body);
    }
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const detailMatch = pathname.match(/^\/scenes\/([^/]+)\/stories\/([^/]+)$/);
  if (detailMatch) {
    const sceneId = decodeURIComponent(detailMatch[1] ?? "");
    const storyId = decodeURIComponent(detailMatch[2] ?? "");
    if (!sceneId || !storyId) return jsonResponse({ error: "invalid_story_id" }, { status: 400 });
    const user = await requireAuthUser(env, request);
    if (request.method === "GET") return getSceneStory(request, env, user, sceneId, storyId);
    if (request.method === "PATCH") {
      const body = await readJson<unknown>(request).catch(() => null);
      return updateSceneStory(env, user, sceneId, storyId, body);
    }
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const taskMatch = pathname.match(/^\/scenes\/([^/]+)\/stories\/([^/]+)\/tasks\/([^/]+)\/(complete|reopen)$/);
  if (taskMatch) {
    const sceneId = decodeURIComponent(taskMatch[1] ?? "");
    const storyId = decodeURIComponent(taskMatch[2] ?? "");
    const taskId = decodeURIComponent(taskMatch[3] ?? "");
    const action = taskMatch[4];
    if (!sceneId || !storyId || !taskId) return jsonResponse({ error: "invalid_task_id" }, { status: 400 });
    if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    const user = await requireAuthUser(env, request);
    const body = await readJson<{ companion_id?: unknown }>(request).catch((): { companion_id?: unknown } => ({}));
    const companionId = typeof body?.companion_id === "string" ? body.companion_id : null;
    if (!companionId) return jsonResponse({ error: "invalid_request", field: "companion_id" }, { status: 400 });
    return updateTaskProgress(env, user, sceneId, storyId, companionId, taskId, action === "complete");
  }

  const inviteCompanionsMatch = pathname.match(/^\/scenes\/([^/]+)\/story-invite-companions$/);
  if (inviteCompanionsMatch) {
    const sceneId = decodeURIComponent(inviteCompanionsMatch[1] ?? "");
    if (!sceneId) return jsonResponse({ error: "invalid_scene_id" }, { status: 400 });
    if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    const user = await requireAuthUser(env, request);
    return listStoryInviteCompanions(env, user, sceneId);
  }

  const inviteMatch = pathname.match(/^\/scenes\/([^/]+)\/stories\/([^/]+)\/invite$/);
  if (inviteMatch) {
    const sceneId = decodeURIComponent(inviteMatch[1] ?? "");
    const storyId = decodeURIComponent(inviteMatch[2] ?? "");
    if (!sceneId || !storyId) return jsonResponse({ error: "invalid_story_id" }, { status: 400 });
    if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    const user = await requireAuthUser(env, request);
    const body = await readJson<unknown>(request).catch(() => null);
    return inviteCompanionToStory(env, user, sceneId, storyId, body);
  }

  return null;
}

export async function loadSceneStoryPromptContext(
  env: Env,
  userId: string,
  companionId: string,
  sceneId: string,
  storyId: string,
): Promise<SceneStoryPromptContext | null> {
  const story = await loadVisibleStory(env, userId, sceneId, storyId);
  if (!story) return null;
  const tasks = await loadTasks(env, story.id);
  if (tasks.length === 0) return null;
  const progress = await loadProgress(env, userId, story.id, companionId);
  const completed = parseStringArray(progress?.completed_task_ids ?? null);
  const current = resolveCurrentTask(tasks, completed, progress?.current_task_id ?? null);
  const publicStory = toPublicStory(story, tasks, completed, current?.id ?? null, userId, false);
  return {
    story: {
      id: story.id,
      progress_percent: publicStory.progress_percent,
      synopsis: story.synopsis,
      title: story.title,
    },
    task: current
      ? {
          ai_guidance: current.ai_guidance,
          completion_hint: current.completion_hint,
          id: current.id,
          objective: current.objective,
          order: current.task_order,
          title: current.title,
        }
      : null,
  };
}

async function listSceneStories(request: Request, env: Env, user: UserRecord, sceneId: string): Promise<Response> {
  const scene = await requireUnlockedScene(env, user.id, sceneId);
  if (!scene) return notFound();
  const companionId = new URL(request.url).searchParams.get("companion_id");
  const rows = await loadVisibleStories(env, user.id, sceneId);
  const stories = await Promise.all(rows.map(async (story) => serializeStoryForCompanion(env, user.id, story, companionId, false)));
  return jsonResponse({ stories });
}

async function getSceneStory(
  request: Request,
  env: Env,
  user: UserRecord,
  sceneId: string,
  storyId: string,
): Promise<Response> {
  const scene = await requireUnlockedScene(env, user.id, sceneId);
  if (!scene) return notFound();
  const story = await loadVisibleStory(env, user.id, sceneId, storyId);
  if (!story) return notFound();
  const companionId = new URL(request.url).searchParams.get("companion_id");
  return jsonResponse({ story: await serializeStoryForCompanion(env, user.id, story, companionId, true) });
}

async function createSceneStory(env: Env, user: UserRecord, sceneId: string, body: unknown): Promise<Response> {
  const scene = await requireUnlockedScene(env, user.id, sceneId);
  if (!scene) return notFound();
  const parsed = parseStoryInput(body, true);
  if (!parsed.ok) return parsed.response;

  const now = Date.now();
  const storyId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO scene_stories
       (id, scene_id, owner_user_id, title, synopsis, source_type, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'user_written', 1, ?, ?)`,
  )
    .bind(storyId, sceneId, user.id, parsed.title, parsed.synopsis ?? null, now, now)
    .run();

  await replaceTasks(env, storyId, parsed.tasks ?? [], now);
  const story = await loadVisibleStory(env, user.id, sceneId, storyId);
  return jsonResponse({ story: story ? await serializeStoryForCompanion(env, user.id, story, null, true) : null }, { status: 201 });
}

async function updateSceneStory(
  env: Env,
  user: UserRecord,
  sceneId: string,
  storyId: string,
  body: unknown,
): Promise<Response> {
  const story = await loadVisibleStory(env, user.id, sceneId, storyId);
  if (!story) return notFound();
  if (story.owner_user_id !== user.id) {
    return jsonResponse({ error: "story_not_editable" }, { status: 403 });
  }
  const parsed = parseStoryInput(body, false);
  if (!parsed.ok) return parsed.response;
  const nextTitle = parsed.title ?? story.title;
  const nextSynopsis = parsed.synopsis === undefined ? story.synopsis : parsed.synopsis;
  const now = Date.now();
  await env.DB.prepare(
    `UPDATE scene_stories SET title = ?, synopsis = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(nextTitle, nextSynopsis, now, story.id)
    .run();
  if (parsed.tasks) {
    await replaceTasks(env, story.id, parsed.tasks, now);
  }
  const updated = await loadVisibleStory(env, user.id, sceneId, storyId);
  return jsonResponse({ story: updated ? await serializeStoryForCompanion(env, user.id, updated, null, true) : null });
}

async function updateTaskProgress(
  env: Env,
  user: UserRecord,
  sceneId: string,
  storyId: string,
  companionId: string,
  taskId: string,
  complete: boolean,
): Promise<Response> {
  const story = await loadVisibleStory(env, user.id, sceneId, storyId);
  if (!story) return notFound();
  const companion = await loadCompanionForChat(env, companionId);
  if (!companion || !canChatWithCompanion(companion, user)) return notFound();
  const tasks = await loadTasks(env, story.id);
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return notFound();
  const progress = await loadProgress(env, user.id, story.id, companionId);
  const completed = new Set(parseStringArray(progress?.completed_task_ids ?? null));
  if (complete) completed.add(taskId);
  else completed.delete(taskId);
  const current = resolveCurrentTask(tasks, [...completed], progress?.current_task_id ?? null);
  await upsertProgress(env, user.id, story.id, companionId, current?.id ?? null, [...completed], Date.now());
  return jsonResponse({ story: toPublicStory(story, tasks, [...completed], current?.id ?? null, user.id, true) });
}

async function listStoryInviteCompanions(env: Env, user: UserRecord, sceneId: string): Promise<Response> {
  const scene = await requireUnlockedScene(env, user.id, sceneId);
  if (!scene) return notFound();
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.source, c.relationship_role,
            COALESCE(p.art_key, c.art_url) AS art_url,
            r.level_label AS level_label
     FROM companions c
     LEFT JOIN companion_profile_images p
       ON p.companion_id = c.id AND p.user_id = ?
     LEFT JOIN relationships r
       ON r.companion_id = c.id AND r.user_id = ?
     WHERE c.is_active = 1
       AND (c.source = 'official' OR c.created_by = ?)
       AND COALESCE(p.art_key, c.art_url) IS NOT NULL
     ORDER BY
       CASE WHEN r.last_interaction_at IS NULL THEN 1 ELSE 0 END ASC,
       r.last_interaction_at DESC,
       c.name ASC`,
  )
    .bind(user.id, user.id, user.id)
    .all<InviteCompanionRow>();
  return jsonResponse({
    companions: (results ?? []).map((row) => ({
      art_url: row.art_url,
      id: row.id,
      level: row.level_label,
      name: row.name,
      relationship_role: row.relationship_role,
      source: row.source,
    })),
  });
}

async function inviteCompanionToStory(
  env: Env,
  user: UserRecord,
  sceneId: string,
  storyId: string,
  body: unknown,
): Promise<Response> {
  const scene = await requireUnlockedScene(env, user.id, sceneId);
  if (!scene) return notFound();
  const story = await loadVisibleStory(env, user.id, sceneId, storyId);
  if (!story) return notFound();
  const companionId = readString(body, "companion_id");
  if (!companionId) return jsonResponse({ error: "invalid_request", field: "companion_id" }, { status: 400 });
  const companion = await loadCompanionForChat(env, companionId);
  if (!companion || !canChatWithCompanion(companion, user)) return notFound();
  const tasks = await loadTasks(env, story.id);
  const progress = await loadProgress(env, user.id, story.id, companion.id);
  const completed = parseStringArray(progress?.completed_task_ids ?? null);
  const current = resolveCurrentTask(tasks, completed, progress?.current_task_id ?? null);
  if (!current) return jsonResponse({ error: "story_has_no_active_task" }, { status: 422 });

  const isAdmin = await isAdminUser(env, user.email);
  let reservationId: string | null = null;
  if (!isAdmin) {
    try {
      const reservation = await reserveCredits(env, {
        amount: TASK_CREDIT_COST.chat_message,
        referenceId: crypto.randomUUID(),
        referenceType: "chat_message",
        taskType: "chat_message",
        userId: user.id,
      });
      reservationId = reservation.reservation_id;
    } catch (err) {
      if (err instanceof CreditsError && err.code === "credits_insufficient") {
        return jsonResponse({ error: "credits_insufficient", message: "Not enough credits." }, { status: 402 });
      }
      throw err;
    }
  }

  try {
    const invite = await resolveStoryInvite(env, {
      companionName: companion.name,
      message: readString(body, "message"),
      scene,
      story,
      task: current,
      userId: user.id,
    });
    if (reservationId) await commitReservation(env, reservationId);
    if (invite.accepted) {
      await upsertProgress(env, user.id, story.id, companion.id, current.id, completed, Date.now());
    }
    return jsonResponse({
      accepted: invite.accepted,
      chat: invite.accepted
        ? {
            chat_mode: "story",
            companion_id: companion.id,
            scene_id: scene.id,
            story_id: story.id,
          }
        : null,
      reason: invite.reason,
      reply: invite.reply,
      story: toPublicStory(story, tasks, completed, current.id, user.id, false),
    });
  } catch (err) {
    if (reservationId) await releaseReservation(env, reservationId, "story_invite_failed");
    throw err;
  }
}

async function resolveStoryInvite(
  env: Env,
  args: {
    companionName: string;
    scene: SceneRow;
    story: SceneStoryRow;
    task: SceneStoryTaskRow;
    message: string | null;
    userId: string;
  },
): Promise<{ accepted: boolean; reason: string; reply: string }> {
  const schema = {
    additionalProperties: false,
    properties: {
      accepted: { type: "boolean" },
      reason: { type: "string" },
      reply: { type: "string" },
    },
    required: ["accepted", "reason", "reply"],
    type: "object",
  };
  const messages: LLMMessage[] = [
    {
      role: "system",
      content:
        "You judge whether a fictional companion agrees to join a scene story now. Return JSON only. " +
        "accepted=true only if the companion would clearly agree to participate now. They may refuse, delay, or set a boundary. " +
        "reply must be one short in-character line to show the user.",
    },
    {
      role: "user",
      content: [
        `Companion: ${args.companionName}`,
        `Scene: ${args.scene.name} (${args.scene.mood})`,
        `Story: ${args.story.title}`,
        args.story.synopsis ? `Synopsis: ${args.story.synopsis}` : null,
        `Current task: ${args.task.title} — ${args.task.objective}`,
        args.message ? `User invitation: ${args.message}` : "User invitation: Join this story with me.",
      ].filter(Boolean).join("\n"),
    },
  ];
  const response = await llmCall(
    env,
    {
      json_schema: schema,
      max_tokens: 180,
      messages,
      task: "signal",
      temperature: 0.25,
    },
    { user_id: args.userId },
  );
  const parsed = parseInvitePayload(response.structured ?? response.text);
  if (!parsed) throw new Error("story_invite_parse_failed");
  return parsed;
}

function parseInvitePayload(raw: unknown): { accepted: boolean; reason: string; reply: string } | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.accepted !== "boolean") return null;
  return {
    accepted: record.accepted,
    reason: typeof record.reason === "string" ? record.reason.slice(0, 240) : "",
    reply: typeof record.reply === "string" ? record.reply.slice(0, 500) : "",
  };
}

async function requireUnlockedScene(env: Env, userId: string, sceneId: string): Promise<SceneRow | null> {
  const row = await env.DB.prepare(
    `SELECT id, name, mood, unlock_condition FROM scenes WHERE id = ? AND is_active = 1`,
  )
    .bind(sceneId)
    .first<SceneRow>();
  if (!row) return null;
  const { unlocked } = await evaluateUserSceneUnlock(env, userId, row);
  return unlocked ? row : null;
}

async function loadVisibleStories(env: Env, userId: string, sceneId: string): Promise<SceneStoryRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, scene_id, owner_user_id, title, synopsis, source_type, is_active, created_at, updated_at
     FROM scene_stories
     WHERE scene_id = ?
       AND is_active = 1
       AND (owner_user_id IS NULL OR owner_user_id = ?)
     ORDER BY CASE WHEN owner_user_id IS NULL THEN 0 ELSE 1 END ASC, updated_at DESC, title ASC`,
  )
    .bind(sceneId, userId)
    .all<SceneStoryRow>();
  return results ?? [];
}

async function loadVisibleStory(env: Env, userId: string, sceneId: string, storyId: string): Promise<SceneStoryRow | null> {
  return await env.DB.prepare(
    `SELECT id, scene_id, owner_user_id, title, synopsis, source_type, is_active, created_at, updated_at
     FROM scene_stories
     WHERE id = ? AND scene_id = ? AND is_active = 1
       AND (owner_user_id IS NULL OR owner_user_id = ?)`,
  )
    .bind(storyId, sceneId, userId)
    .first<SceneStoryRow>();
}

async function loadTasks(env: Env, storyId: string): Promise<SceneStoryTaskRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, story_id, task_order, title, objective, ai_guidance, completion_hint, is_active, created_at, updated_at
     FROM scene_story_tasks
     WHERE story_id = ? AND is_active = 1
     ORDER BY task_order ASC, id ASC`,
  )
    .bind(storyId)
    .all<SceneStoryTaskRow>();
  return results ?? [];
}

async function loadProgress(env: Env, userId: string, storyId: string, companionId: string | null): Promise<ProgressRow | null> {
  if (!companionId) return null;
  return await env.DB.prepare(
    `SELECT current_task_id, completed_task_ids
     FROM user_scene_story_progress
     WHERE user_id = ? AND story_id = ? AND companion_id = ?`,
  )
    .bind(userId, storyId, companionId)
    .first<ProgressRow>();
}

async function upsertProgress(
  env: Env,
  userId: string,
  storyId: string,
  companionId: string,
  currentTaskId: string | null,
  completedTaskIds: string[],
  now: number,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO user_scene_story_progress
       (user_id, story_id, companion_id, current_task_id, completed_task_ids, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, story_id, companion_id) DO UPDATE SET
       current_task_id = excluded.current_task_id,
       completed_task_ids = excluded.completed_task_ids,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, storyId, companionId, currentTaskId, JSON.stringify([...new Set(completedTaskIds)]), now)
    .run();
}

async function serializeStoryForCompanion(
  env: Env,
  userId: string,
  story: SceneStoryRow,
  companionId: string | null,
  includeTasks: boolean,
): Promise<SceneStoryPublic> {
  const tasks = await loadTasks(env, story.id);
  const progress = await loadProgress(env, userId, story.id, companionId);
  const completed = parseStringArray(progress?.completed_task_ids ?? null);
  const current = resolveCurrentTask(tasks, completed, progress?.current_task_id ?? null);
  return toPublicStory(story, tasks, completed, current?.id ?? null, userId, includeTasks);
}

function toPublicStory(
  story: SceneStoryRow,
  tasks: SceneStoryTaskRow[],
  completedIds: string[],
  currentTaskId: string | null,
  userId: string,
  includeTasks: boolean,
): SceneStoryPublic {
  const completed = new Set(completedIds);
  const activeTasks = tasks.filter((task) => task.is_active !== 0);
  const doneCount = activeTasks.filter((task) => completed.has(task.id)).length;
  const taskCount = activeTasks.length;
  const current = activeTasks.find((task) => task.id === currentTaskId) ?? activeTasks.find((task) => !completed.has(task.id)) ?? null;
  const storyPublic: SceneStoryPublic = {
    can_edit: story.owner_user_id === userId,
    current_task: current ? toPublicTask(current, completed, current.id) : null,
    id: story.id,
    progress_percent: taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100),
    scene_id: story.scene_id,
    source_type: normalizeSourceType(story.source_type),
    synopsis: story.synopsis,
    task_count: taskCount,
    title: story.title,
  };
  if (includeTasks) {
    storyPublic.tasks = activeTasks.map((task) => toPublicTask(task, completed, current?.id ?? null));
  }
  return storyPublic;
}

function toPublicTask(
  task: SceneStoryTaskRow,
  completed: Set<string>,
  currentTaskId: string | null,
): SceneStoryTaskPublic {
  return {
    ai_guidance: task.ai_guidance,
    completion_hint: task.completion_hint,
    id: task.id,
    objective: task.objective,
    order: task.task_order,
    status: completed.has(task.id) ? "completed" : task.id === currentTaskId ? "active" : "locked",
    title: task.title,
  };
}

function resolveCurrentTask(
  tasks: SceneStoryTaskRow[],
  completedIds: string[],
  currentTaskId: string | null,
): SceneStoryTaskRow | null {
  const completed = new Set(completedIds);
  const active = tasks.filter((task) => task.is_active !== 0);
  if (currentTaskId) {
    const current = active.find((task) => task.id === currentTaskId && !completed.has(task.id));
    if (current) return current;
  }
  return active.find((task) => !completed.has(task.id)) ?? null;
}

async function replaceTasks(env: Env, storyId: string, tasks: StoryTaskInput[], now: number): Promise<void> {
  await env.DB.prepare(`UPDATE scene_story_tasks SET is_active = 0, updated_at = ? WHERE story_id = ?`)
    .bind(now, storyId)
    .run();
  const insert = env.DB.prepare(
    `INSERT INTO scene_story_tasks
       (id, story_id, task_order, title, objective, ai_guidance, completion_hint, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  await env.DB.batch(tasks.map((task, index) => insert.bind(
    crypto.randomUUID(),
    storyId,
    index + 1,
    task.title,
    task.objective,
    task.ai_guidance,
    task.completion_hint,
    now,
    now,
  )));
}

type StoryTaskInput = {
  title: string;
  objective: string;
  ai_guidance: string;
  completion_hint: string | null;
};

type StoryInputResult =
  | { ok: true; title?: string; synopsis?: string | null; tasks?: StoryTaskInput[] }
  | { ok: false; response: Response };

function parseStoryInput(body: unknown, requireTasks: boolean): StoryInputResult {
  if (!body || typeof body !== "object") {
    return { ok: false, response: jsonResponse({ error: "invalid_request" }, { status: 400 }) };
  }
  const title = readOptionalString(body, "title", TITLE_MAX);
  if (title === false) return { ok: false, response: jsonResponse({ error: "invalid_request", field: "title" }, { status: 400 }) };
  const synopsis = readOptionalNullableString(body, "synopsis", SYNOPSIS_MAX);
  if (synopsis === false) return { ok: false, response: jsonResponse({ error: "invalid_request", field: "synopsis" }, { status: 400 }) };
  const rawTasks = (body as Record<string, unknown>).tasks;
  const tasks = rawTasks === undefined ? undefined : parseTasks(rawTasks);
  if (tasks === false || (requireTasks && (!tasks || tasks.length === 0))) {
    return { ok: false, response: jsonResponse({ error: "invalid_request", field: "tasks" }, { status: 400 }) };
  }
  if (requireTasks && !title) {
    return { ok: false, response: jsonResponse({ error: "invalid_request", field: "title" }, { status: 400 }) };
  }
  return { ok: true, synopsis, tasks, title: title ?? undefined };
}

function parseTasks(raw: unknown): StoryTaskInput[] | false {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_TASKS) return false;
  const out: StoryTaskInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return false;
    const title = readOptionalString(item, "title", TITLE_MAX);
    const objective = readOptionalString(item, "objective", OBJECTIVE_MAX);
    const aiGuidance = readOptionalString(item, "ai_guidance", GUIDANCE_MAX);
    const completionHint = readOptionalNullableString(item, "completion_hint", HINT_MAX);
    if (!title || !objective || !aiGuidance || completionHint === false) return false;
    out.push({ ai_guidance: aiGuidance, completion_hint: completionHint ?? null, objective, title });
  }
  return out;
}

function readString(body: unknown, key: string): string | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalString(body: unknown, key: string, max: number): string | false | null {
  if (!body || typeof body !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(body, key)) return null;
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : false;
}

function readOptionalNullableString(body: unknown, key: string, max: number): string | false | null | undefined {
  if (!body || typeof body !== "object") return undefined;
  if (!Object.prototype.hasOwnProperty.call(body, key)) return undefined;
  const value = (body as Record<string, unknown>)[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length <= max ? (trimmed.length > 0 ? trimmed : null) : false;
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizeSourceType(raw: string): SceneStorySourceType {
  if (raw === "official_preset" || raw === "ai_assisted") return raw;
  return "user_written";
}
