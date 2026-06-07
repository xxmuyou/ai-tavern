import { requireAuthUser } from "../auth";
import { isProUser } from "../billing/entitlements";
import { jsonResponse, notFound } from "../http";
import type { UserRecord } from "../identity";
import { llmCall } from "../llm/router";

import { firstTimeMemoryType } from "./memory-hooks";
import { FREE_MEMORY_CAP } from "./config";
import type { ActivityRecord, ActivityType, MemoryRecord, MemoryType } from "./types";

// GET /memories?companion_id=...&limit=...
// Returns newest-first. Free users are capped at FREE_MEMORY_CAP in the
// response (older rows fade out). The full set is preserved in the DB so a
// Free->Pro upgrade restores them.

type MemoryRow = {
  id: string;
  user_id: string;
  companion_id: string;
  memory_type: string;
  memory_subtype: string;
  scene_id: string | null;
  activity_id: string | null;
  title: string;
  summary: string;
  key_choice: string | null;
  relationship_delta: string | null;
  cg_template: string | null;
  cg_url: string | null;
  created_at: number;
};

type RelationshipDeltaInput = Record<string, number> | null;

export async function handleMemoryRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== "/memories") return null;
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }
  const user = await requireAuthUser(env, request);
  const url = new URL(request.url);
  const companionId = url.searchParams.get("companion_id");
  if (!companionId) {
    return jsonResponse({ error: "missing_companion_id" }, { status: 400 });
  }
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;
  return listMemories(env, user, companionId, limit);
}

async function listMemories(
  env: Env,
  user: UserRecord,
  companionId: string,
  limit: number,
): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, companion_id, memory_type, memory_subtype, scene_id, activity_id,
            title, summary, key_choice, relationship_delta, cg_template, cg_url, created_at
     FROM memories
     WHERE user_id = ? AND companion_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(user.id, companionId, limit)
    .all<MemoryRow>();

  const total = results?.length ?? 0;
  const pro = await isProUser(env, user.id);
  const cap = pro ? null : FREE_MEMORY_CAP;
  const visible = pro ? (results ?? []) : (results ?? []).slice(0, FREE_MEMORY_CAP);
  const truncated = !pro && total > FREE_MEMORY_CAP;

  return jsonResponse({
    memories: visible.map(rowToRecord),
    total,
    capacity_limit: cap,
    truncated,
  });
}

function rowToRecord(row: MemoryRow): MemoryRecord {
  let delta: Record<string, number> | null = null;
  if (row.relationship_delta) {
    try {
      const parsed = JSON.parse(row.relationship_delta);
      if (parsed && typeof parsed === "object") delta = parsed as Record<string, number>;
    } catch {
      delta = null;
    }
  }
  return {
    id: row.id,
    user_id: row.user_id,
    companion_id: row.companion_id,
    memory_type: row.memory_type as MemoryType,
    memory_subtype: row.memory_subtype,
    scene_id: row.scene_id,
    activity_id: row.activity_id,
    title: row.title,
    summary: row.summary,
    key_choice: row.key_choice,
    relationship_delta: delta,
    cg_template: row.cg_template,
    cg_url: row.cg_url,
    created_at: row.created_at,
  };
}

// -----------------------------------------------------------------------------
// Activity completion hook (referenced via memory-hooks.ts)
// -----------------------------------------------------------------------------

type ActivityHookInput = Pick<
  ActivityRecord,
  "id" | "user_id" | "companion_id" | "scene_id" | "activity_type" | "completed_at" | "metadata"
> & {
  daily_state_snapshot: string | ActivityRecord["daily_state_snapshot"];
};

export async function onActivityMemoryHook(env: Env, activity: ActivityHookInput): Promise<void> {
  const at = activity.activity_type as ActivityType;
  const baseMemoryType = firstTimeMemoryType(at);

  // First check whether this is the very first interaction (any type) with
  // this companion — emits a first_meeting memory before any other type.
  await maybeWriteFirstMeeting(env, activity);

  if (!baseMemoryType) return;

  // For gift_received, every gift becomes its own memory (subtype = activity id).
  // For first_hangout / first_date / repair, only the first one of each type.
  const subtype = baseMemoryType === "gift_received" ? activity.id : "";

  const exists = await memoryExists(env, activity.user_id, activity.companion_id, baseMemoryType, subtype);
  if (exists) return;

  await writeMemory(env, {
    user_id: activity.user_id,
    companion_id: activity.companion_id,
    memory_type: baseMemoryType,
    memory_subtype: subtype,
    scene_id: activity.scene_id,
    activity_id: activity.id,
    title: titleForActivityMemory(baseMemoryType, activity),
    summary: await generateMemorySummary(env, activity, baseMemoryType),
    key_choice: null,
    relationship_delta: null,
    cg_template: cgTemplateFor(baseMemoryType),
    cg_url: null,
  });
}

async function maybeWriteFirstMeeting(env: Env, activity: ActivityHookInput): Promise<void> {
  const exists = await memoryExists(env, activity.user_id, activity.companion_id, "first_meeting", "");
  if (exists) return;
  await writeMemory(env, {
    user_id: activity.user_id,
    companion_id: activity.companion_id,
    memory_type: "first_meeting",
    memory_subtype: "",
    scene_id: activity.scene_id,
    activity_id: null,
    title: defaultTitleFor("first_meeting"),
    summary: await generateMemorySummary(env, activity, "first_meeting"),
    key_choice: null,
    relationship_delta: null,
    cg_template: null,
    cg_url: null,
  });
}

// Public so the chat narrative path can emit a confession memory when a
// confession signal is detected. Idempotent — dedup is enforced.
export async function writeConfessionMemory(
  env: Env,
  args: {
    user_id: string;
    companion_id: string;
    scene_id: string | null;
    key_choice: string | null;
    relationship_delta: RelationshipDeltaInput;
  },
): Promise<void> {
  const exists = await memoryExists(env, args.user_id, args.companion_id, "confession", "");
  if (exists) return;
  await writeMemory(env, {
    user_id: args.user_id,
    companion_id: args.companion_id,
    memory_type: "confession",
    memory_subtype: "",
    scene_id: args.scene_id,
    activity_id: null,
    title: defaultTitleFor("confession"),
    summary: "A confession that changed the way you look at each other.",
    key_choice: args.key_choice,
    relationship_delta: args.relationship_delta,
    cg_template: cgTemplateFor("confession"),
    cg_url: null,
  });
}

// Public so anniversary hook (A7) can drop in anniversary memories.
export async function writeAnniversaryMemory(
  env: Env,
  args: {
    user_id: string;
    companion_id: string;
    subtype: "30d" | "100d" | "365d";
    summary: string;
  },
): Promise<void> {
  const exists = await memoryExists(env, args.user_id, args.companion_id, "anniversary", args.subtype);
  if (exists) return;
  await writeMemory(env, {
    user_id: args.user_id,
    companion_id: args.companion_id,
    memory_type: "anniversary",
    memory_subtype: args.subtype,
    scene_id: null,
    activity_id: null,
    title: anniversaryTitle(args.subtype),
    summary: args.summary,
    key_choice: null,
    relationship_delta: null,
    cg_template: cgTemplateFor("anniversary"),
    cg_url: null,
  });
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function memoryExists(
  env: Env,
  userId: string,
  companionId: string,
  memoryType: MemoryType,
  memorySubtype: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT id FROM memories
     WHERE user_id = ? AND companion_id = ? AND memory_type = ? AND memory_subtype = ?
     LIMIT 1`,
  )
    .bind(userId, companionId, memoryType, memorySubtype)
    .first<{ id: string }>();
  return !!row;
}

type WriteMemoryInput = {
  user_id: string;
  companion_id: string;
  memory_type: MemoryType;
  memory_subtype: string;
  scene_id: string | null;
  activity_id: string | null;
  title: string;
  summary: string;
  key_choice: string | null;
  relationship_delta: RelationshipDeltaInput;
  cg_template: string | null;
  cg_url: string | null;
};

async function writeMemory(env: Env, input: WriteMemoryInput): Promise<void> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO memories
       (id, user_id, companion_id, memory_type, memory_subtype, scene_id, activity_id,
        title, summary, key_choice, relationship_delta, cg_template, cg_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.user_id,
      input.companion_id,
      input.memory_type,
      input.memory_subtype,
      input.scene_id,
      input.activity_id,
      input.title,
      input.summary,
      input.key_choice,
      input.relationship_delta ? JSON.stringify(input.relationship_delta) : null,
      input.cg_template,
      input.cg_url,
      now,
    )
    .run();
}

async function generateMemorySummary(
  env: Env,
  activity: ActivityHookInput,
  memoryType: MemoryType,
): Promise<string> {
  const snapshotText = typeof activity.daily_state_snapshot === "string"
    ? activity.daily_state_snapshot
    : JSON.stringify(activity.daily_state_snapshot);
  const itemId = readQuickActionItemId(activity);
  const actionText = itemId
    ? `Specific gift/action: ${itemId === "coffee" ? "the user ordered coffee for both of them" : "the user sent flowers"}.\n`
    : "";
  const prompt = `Write a one-paragraph (max 60 words) diary-style summary of this moment.\n`
    + `Memory type: ${memoryType}.\n`
    + `Activity type: ${activity.activity_type}.\n`
    + `Scene id: ${activity.scene_id}.\n`
    + `Companion's daily state: ${snapshotText}.\n`
    + actionText
    + `Use past-tense first-person ("we", "I"). Be specific and warm. No quotes.`;
  try {
    const resp = await llmCall(env, {
      task: "memory_summary",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 120,
      temperature: 0.7,
    }, { user_id: null }); // system task: not billed against user quota
    if (resp.text?.trim()) return resp.text.trim();
  } catch {
    // fall through
  }
  return defaultSummaryFor(memoryType);
}

function defaultTitleFor(memoryType: MemoryType): string {
  switch (memoryType) {
    case "first_meeting": return "The first time you met";
    case "first_hangout": return "Your first time hanging out";
    case "first_date": return "Your first real date";
    case "gift_received": return "A small gift";
    case "confession": return "An honest moment";
    case "repair": return "Mending the bond";
    case "anniversary": return "An anniversary";
  }
}

function titleForActivityMemory(memoryType: MemoryType, activity: ActivityHookInput): string {
  const itemId = readQuickActionItemId(activity);
  if (memoryType === "gift_received" && itemId === "coffee") return "Coffee together";
  if (memoryType === "gift_received" && itemId === "flowers") return "Flowers sent";
  return defaultTitleFor(memoryType);
}

function defaultSummaryFor(memoryType: MemoryType): string {
  switch (memoryType) {
    case "first_meeting": return "We crossed paths and something started.";
    case "first_hangout": return "An easy afternoon that felt longer than it was.";
    case "first_date": return "A first date that we'll both remember.";
    case "gift_received": return "A small token that meant more than its size.";
    case "confession": return "A truth said out loud, finally.";
    case "repair": return "We talked it out and found each other again.";
    case "anniversary": return "Another quiet milestone, just for us.";
  }
}

function readQuickActionItemId(activity: ActivityHookInput): "coffee" | "flowers" | null {
  const itemId = activity.metadata?.item_id;
  return itemId === "coffee" || itemId === "flowers" ? itemId : null;
}

function cgTemplateFor(memoryType: MemoryType): string | null {
  switch (memoryType) {
    case "first_date":
    case "confession":
    case "repair":
    case "anniversary":
      return memoryType;
    default:
      return null;
  }
}

function anniversaryTitle(subtype: "30d" | "100d" | "365d"): string {
  switch (subtype) {
    case "30d": return "Thirty days together";
    case "100d": return "One hundred days";
    case "365d": return "A year of you";
  }
}
