import { llmCall } from "../llm/router";
import type {
  Availability,
  CompanionDailyState,
  Mood,
  TimeSlot,
} from "./types";
import { AVAILABILITIES, MOODS } from "./types";

// Deterministic per-companion daily state generator.
//
// Two layers of caching:
//   1. companion_daily_states: rule fields (scene/mood/availability/hint).
//      Computed via seeded PRNG so all users see the same "Maya is at Moon
//      Bar this afternoon" — zero per-user LLM cost.
//   2. companion_daily_flavor: optional LLM-generated short paragraph,
//      cached per (user, companion, date, slot). Generated lazily on
//      explicit request (e.g. opening companion detail).

type CompanionRow = {
  id: string;
  source: "official" | "user";
  name: string;
  preferred_scenes: string | null;
};

type DailyStateRow = {
  companion_id: string;
  date_local: string;
  time_slot: string;
  scene_id: string;
  mood: string;
  availability: string;
  activity_hint: string;
};

// Fallback scene when neither preferred_scenes nor scenes.default_companions
// yield a candidate. Picks the first active scene by display_order.
async function pickFallbackSceneId(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT id FROM scenes WHERE is_active = 1 ORDER BY display_order ASC, id ASC LIMIT 1`,
  ).first<{ id: string }>();
  return row?.id ?? null;
}

async function loadCompanionForState(env: Env, companionId: string): Promise<CompanionRow | null> {
  return env.DB.prepare(
    `SELECT id, source, name, preferred_scenes
     FROM companions WHERE id = ? AND is_active = 1`,
  )
    .bind(companionId)
    .first<CompanionRow>();
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

// FNV-1a 32-bit hash of (companion + date + slot) — fast, deterministic,
// produces enough entropy to seed a slot/mood pick.
function seedHash(companionId: string, dateLocal: string, slot: TimeSlot): number {
  const input = `${companionId}|${dateLocal}|${slot}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Simple xorshift32 PRNG bootstrapped from the seed hash. Produces a stable
// sequence of values used to pick scene / mood / availability / hint.
function makePrng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function pickFromArray<T>(arr: readonly T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length] as T;
}

// Activity-hint candidates per slot, intentionally generic so they read
// well across scenes. Slot variance is rule-side; scene-specific wording
// is handled by the LLM flavor_text layer.
const HINT_BY_SLOT: Record<TimeSlot, readonly string[]> = {
  morning: ["sipping coffee", "stretching outside", "skimming the news", "writing in a notebook"],
  afternoon: ["reading alone", "running an errand", "people-watching", "working on a side project"],
  evening: ["winding down", "meeting an old friend", "having a slow drink", "watching the city light up"],
  night: ["thinking out loud", "scrolling photos", "out on a late walk", "listening to records"],
};

// Mood weighting hints: certain slots tilt mood probabilities. Each
// mood appears at least once so any (companion, day, slot) can land on
// any mood given the right seed.
const MOOD_POOL_BY_SLOT: Record<TimeSlot, readonly Mood[]> = {
  morning: ["calm", "busy", "playful", "tired", "guarded", "lonely"],
  afternoon: ["busy", "calm", "playful", "guarded", "tired", "lonely"],
  evening: ["playful", "calm", "lonely", "guarded", "tired", "busy"],
  night: ["lonely", "guarded", "calm", "tired", "playful", "busy"],
};

// Availability roll: bias toward "available" so most slots can be played,
// but include occasional busy/away for verisimilitude. User-created
// companions always force "available" regardless of this pool.
const AVAILABILITY_POOL: readonly Availability[] = [
  "available", "available", "available", "available", "busy", "busy", "away",
];

type RuleFields = {
  scene_id: string;
  mood: Mood;
  availability: Availability;
  activity_hint: string;
};

// Pick a scene for an official companion. Looks at companion.preferred_scenes
// intersected with `scenes.default_companions` to favour places where the
// companion is canonically present. Falls back to preferred_scenes alone,
// then to the global default scene.
async function pickOfficialScene(
  env: Env,
  companion: CompanionRow,
  prng: () => number,
): Promise<string | null> {
  const preferred = parseStringArray(companion.preferred_scenes);
  if (preferred.length === 0) {
    return pickFallbackSceneId(env);
  }

  // Find which of the preferred scenes list this companion in default_companions
  // (= the scenes that consider this companion canonical). Weight those higher.
  const placeholders = preferred.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, default_companions FROM scenes WHERE id IN (${placeholders}) AND is_active = 1`,
  )
    .bind(...preferred)
    .all<{ id: string; default_companions: string | null }>();

  const canonical: string[] = [];
  const acceptable: string[] = [];
  for (const row of results ?? []) {
    const defaults = parseStringArray(row.default_companions);
    if (defaults.includes(companion.id)) canonical.push(row.id);
    else acceptable.push(row.id);
  }

  const pool = canonical.length > 0 ? canonical : acceptable;
  if (pool.length === 0) {
    return preferred[0] ?? (await pickFallbackSceneId(env));
  }
  return pickFromArray(pool, prng());
}

// User-created companions have simpler rules per docs/product/daily-life-sim.md:
//   - preferred_scenes non-empty -> rotate through them by slot index
//   - preferred_scenes empty     -> fix to a single fallback scene
async function pickUserScene(env: Env, companion: CompanionRow, slot: TimeSlot): Promise<string | null> {
  const preferred = parseStringArray(companion.preferred_scenes);
  if (preferred.length === 0) {
    return pickFallbackSceneId(env);
  }
  const slotIndex: Record<TimeSlot, number> = {
    morning: 0,
    afternoon: 1,
    evening: 2,
    night: 3,
  };
  return preferred[slotIndex[slot] % preferred.length] ?? preferred[0] ?? null;
}

async function computeRuleFields(
  env: Env,
  companion: CompanionRow,
  dateLocal: string,
  slot: TimeSlot,
): Promise<RuleFields> {
  const seed = seedHash(companion.id, dateLocal, slot);
  const prng = makePrng(seed);

  const sceneId = companion.source === "user"
    ? await pickUserScene(env, companion, slot)
    : await pickOfficialScene(env, companion, prng);

  // If the database has no scenes at all, fall back to a sentinel id; the
  // caller will surface a 404-ish state. In practice scenes seed always
  // runs before this code path.
  const resolvedScene = sceneId ?? "unknown";

  const moodPool = MOOD_POOL_BY_SLOT[slot];
  const mood = pickFromArray(moodPool, prng()) as Mood;

  const availability: Availability = companion.source === "user"
    ? "available"
    : (pickFromArray(AVAILABILITY_POOL, prng()) as Availability);

  const activityHint = pickFromArray(HINT_BY_SLOT[slot], prng());

  return {
    scene_id: resolvedScene,
    mood,
    availability,
    activity_hint: activityHint,
  };
}

// Public entry: look up daily state row; if missing, compute + insert.
// The (companion, date, slot) triple is the global cache key, so all users
// share the same answer for a given companion on a given slot.
export async function getOrComputeDailyState(
  env: Env,
  companionId: string,
  dateLocal: string,
  slot: TimeSlot,
): Promise<CompanionDailyState | null> {
  const cached = await env.DB.prepare(
    `SELECT companion_id, date_local, time_slot, scene_id, mood, availability, activity_hint
     FROM companion_daily_states
     WHERE companion_id = ? AND date_local = ? AND time_slot = ?`,
  )
    .bind(companionId, dateLocal, slot)
    .first<DailyStateRow>();

  if (cached) {
    return rowToState(cached);
  }

  const companion = await loadCompanionForState(env, companionId);
  if (!companion) return null;

  const rule = await computeRuleFields(env, companion, dateLocal, slot);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO companion_daily_states
       (companion_id, date_local, time_slot, scene_id, mood, availability, activity_hint, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      companionId,
      dateLocal,
      slot,
      rule.scene_id,
      rule.mood,
      rule.availability,
      rule.activity_hint,
      now,
    )
    .run();

  return {
    companion_id: companionId,
    date_local: dateLocal,
    time_slot: slot,
    scene_id: rule.scene_id,
    mood: rule.mood,
    availability: rule.availability,
    activity_hint: rule.activity_hint,
  };
}

function rowToState(row: DailyStateRow): CompanionDailyState {
  return {
    companion_id: row.companion_id,
    date_local: row.date_local,
    time_slot: row.time_slot as TimeSlot,
    scene_id: row.scene_id,
    mood: (MOODS as readonly string[]).includes(row.mood) ? (row.mood as Mood) : "calm",
    availability: (AVAILABILITIES as readonly string[]).includes(row.availability)
      ? (row.availability as Availability)
      : "available",
    activity_hint: row.activity_hint,
  };
}

// Lazy-loaded flavor text. Stored per user so different players see slightly
// different sentences; cached so re-opening the same companion same slot
// does not re-bill the LLM.
export async function getOrGenerateFlavorText(
  env: Env,
  userId: string,
  state: CompanionDailyState,
  companionName: string,
): Promise<string> {
  const cached = await env.DB.prepare(
    `SELECT flavor_text FROM companion_daily_flavor
     WHERE user_id = ? AND companion_id = ? AND date_local = ? AND time_slot = ?`,
  )
    .bind(userId, state.companion_id, state.date_local, state.time_slot)
    .first<{ flavor_text: string }>();

  if (cached?.flavor_text) return cached.flavor_text;

  const prompt = `You write one short sentence (max 25 words) describing what ${companionName} is doing right now. `
    + `Use vivid present-tense detail. No quotation marks, no narration of the player. `
    + `Context: time of day = ${state.time_slot}, mood = ${state.mood}, location id = ${state.scene_id}, doing = ${state.activity_hint}.`;

  let text = `${companionName} is ${state.activity_hint}.`;
  try {
    const resp = await llmCall(env, {
      task: "daily_state_flavor",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 80,
      temperature: 0.7,
    }, { user_id: null }); // system task: user_id=null avoids quota attribution
    if (resp.text?.trim()) text = resp.text.trim();
  } catch {
    // Network / config error -> keep the deterministic fallback sentence.
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO companion_daily_flavor
       (user_id, companion_id, date_local, time_slot, flavor_text, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, state.companion_id, state.date_local, state.time_slot, text, Date.now())
    .run();

  return text;
}
