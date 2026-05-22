import { requireAuthUser } from "../auth";
import { isProUser } from "../billing/entitlements";
import { QUOTA_LIMITS } from "../billing/quota";
import { jsonResponse, notFound, readJson } from "../http";
import type { UserRecord } from "../identity";
import { ZERO_DIMENSIONS, computeLevel } from "../relationships";

const MAX_FREE_USER_COMPANIONS = QUOTA_LIMITS.FREE_CUSTOM_COMPANIONS;
const NAME_MAX = 80;
const TEXT_FIELD_MAX = 4000;
const KNOWN_RELATIONSHIP_ROLES: ReadonlySet<string> = new Set([
  "colleague",
  "neighbor",
  "friend",
  "crush",
  "stranger",
  "family",
]);

type CompanionRow = {
  id: string;
  source: "official" | "user";
  created_by: string | null;
  is_active: number;
  name: string;
  appearance: string | null;
  personality: string | null;
  background: string | null;
  speech_style: string | null;
  relationship_role: string | null;
  preferred_scenes: string | null;
  art_url: string | null;
  initial_dims: string | null;
  created_at: number;
  updated_at: number;
};

type RelationshipRow = {
  closeness: number;
  trust: number;
  romance: number;
  friendship: number;
  hostility: number;
  tension: number;
  distance: number;
  level_label: string | null;
  first_met_at: number;
  last_interaction_at: number;
};

type CompanionListItem = {
  id: string;
  source: "official" | "user";
  name: string;
  relationship_role: string | null;
  art_url: string | null;
  preferred_scenes: string[];
  current_level: string | null;
  last_interaction_at: number | null;
};

export async function handleCompanionsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/companions") {
    const user = await requireAuthUser(env, request);

    if (request.method === "GET") {
      const url = new URL(request.url);
      const source = url.searchParams.get("source") ?? "all";
      return listCompanions(env, user, source);
    }

    if (request.method === "POST") {
      const body = await readJson<unknown>(request);
      return createCompanion(env, user, body);
    }

    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const idMatch = pathname.match(/^\/companions\/([^/]+)$/);
  if (idMatch) {
    const companionId = decodeURIComponent(idMatch[1] ?? "");
    if (!companionId) {
      return jsonResponse({ error: "invalid_companion_id" }, { status: 400 });
    }

    const user = await requireAuthUser(env, request);

    if (request.method === "GET") {
      return getCompanion(env, user, companionId);
    }

    if (request.method === "PUT") {
      const body = await readJson<unknown>(request);
      return updateCompanion(env, user, companionId, body);
    }

    if (request.method === "DELETE") {
      return deleteCompanion(env, user, companionId);
    }

    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  // /companions/assist or other sub-paths -> let index.ts 404 (spec-002 will wire LLM-assisted creation)
  return null;
}

// -----------------------------------------------------------------------------
// Handlers
// -----------------------------------------------------------------------------

async function listCompanions(env: Env, user: UserRecord, source: string): Promise<Response> {
  let whereClause: string;
  let binds: unknown[] = [];

  switch (source) {
    case "official":
      whereClause = "c.source = 'official' AND c.is_active = 1";
      break;
    case "user":
      whereClause = "c.source = 'user' AND c.created_by = ? AND c.is_active = 1";
      binds = [user.id];
      break;
    case "all":
    default:
      whereClause = "c.is_active = 1 AND (c.source = 'official' OR c.created_by = ?)";
      binds = [user.id];
  }

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.source, c.created_by, c.is_active, c.name,
            c.appearance, c.personality, c.background, c.speech_style,
            c.relationship_role, c.preferred_scenes, c.art_url,
            c.initial_dims, c.created_at, c.updated_at,
            r.level_label         AS level_label,
            r.last_interaction_at AS last_interaction_at
     FROM companions c
     LEFT JOIN relationships r ON r.companion_id = c.id AND r.user_id = ?
     WHERE ${whereClause}
     ORDER BY c.created_at ASC`,
  )
    .bind(user.id, ...binds)
    .all<CompanionRow & { level_label: string | null; last_interaction_at: number | null }>();

  const items: CompanionListItem[] = (results ?? []).map((row) => ({
    art_url: row.art_url,
    current_level: row.level_label,
    id: row.id,
    last_interaction_at: row.last_interaction_at,
    name: row.name,
    preferred_scenes: parseStringArray(row.preferred_scenes),
    relationship_role: row.relationship_role,
    source: row.source,
  }));

  return jsonResponse({ items });
}

async function getCompanion(env: Env, user: UserRecord, companionId: string): Promise<Response> {
  const row = await loadCompanion(env, companionId);
  if (!row) {
    return notFound();
  }

  if (!canRead(row, user)) {
    return notFound();
  }

  const relationship = await loadRelationship(env, user.id, companionId);
  const dimensions = relationship
    ? {
        closeness: relationship.closeness,
        distance: relationship.distance,
        friendship: relationship.friendship,
        hostility: relationship.hostility,
        romance: relationship.romance,
        tension: relationship.tension,
        trust: relationship.trust,
      }
    : { ...ZERO_DIMENSIONS };

  const body = {
    appearance: row.appearance,
    art_url: row.art_url,
    background: row.background,
    id: row.id,
    name: row.name,
    personality: row.personality,
    preferred_scenes: parseStringArray(row.preferred_scenes),
    relationship: {
      dimensions,
      first_met_at: relationship?.first_met_at ?? null,
      last_interaction_at: relationship?.last_interaction_at ?? null,
      level: computeLevel(dimensions),
    },
    relationship_role: row.relationship_role,
    source: row.source,
    speech_style: row.speech_style,
  };

  return jsonResponse(body);
}

async function createCompanion(env: Env, user: UserRecord, raw: unknown): Promise<Response> {
  const input = parseCreateInput(raw);
  if ("error" in input) {
    return input.response;
  }

  const activeCount = await countActiveUserCompanions(env, user.id);
  const pro = await isProUser(env, user.id);
  if (!pro && activeCount >= MAX_FREE_USER_COMPANIONS) {
    return jsonResponse(
      { error: "quota_exceeded", limit: MAX_FREE_USER_COMPANIONS, current: activeCount },
      { status: 402 },
    );
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO companions
      (id, source, created_by, is_active, name, appearance, personality,
       background, speech_style, relationship_role, preferred_scenes,
       art_url, initial_dims, created_at, updated_at)
     VALUES (?, 'user', ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  )
    .bind(
      id,
      user.id,
      input.value.name,
      input.value.appearance ?? null,
      input.value.personality ?? null,
      input.value.background ?? null,
      input.value.speech_style ?? null,
      input.value.relationship_role ?? null,
      input.value.preferred_scenes ? JSON.stringify(input.value.preferred_scenes) : null,
      input.value.art_url ?? null,
      now,
      now,
    )
    .run();

  const created = await loadCompanion(env, id);
  if (!created) {
    return jsonResponse({ error: "internal_error" }, { status: 500 });
  }

  return jsonResponse(serializeOwnCompanion(created), { status: 201 });
}

async function updateCompanion(
  env: Env,
  user: UserRecord,
  companionId: string,
  raw: unknown,
): Promise<Response> {
  const existing = await loadCompanion(env, companionId);
  if (!existing) {
    return notFound();
  }

  if (existing.source !== "user") {
    return jsonResponse({ error: "forbidden_official" }, { status: 403 });
  }

  if (existing.created_by !== user.id) {
    return jsonResponse({ error: "forbidden_not_owner" }, { status: 403 });
  }

  const patch = parseUpdateInput(raw);
  if ("error" in patch) {
    return patch.response;
  }

  const merged = {
    appearance: patch.value.appearance ?? existing.appearance,
    art_url: patch.value.art_url ?? existing.art_url,
    background: patch.value.background ?? existing.background,
    name: patch.value.name ?? existing.name,
    personality: patch.value.personality ?? existing.personality,
    preferred_scenes:
      patch.value.preferred_scenes !== undefined
        ? JSON.stringify(patch.value.preferred_scenes)
        : existing.preferred_scenes,
    relationship_role: patch.value.relationship_role ?? existing.relationship_role,
    speech_style: patch.value.speech_style ?? existing.speech_style,
  };

  await env.DB.prepare(
    `UPDATE companions
     SET name = ?, appearance = ?, personality = ?, background = ?,
         speech_style = ?, relationship_role = ?, preferred_scenes = ?,
         art_url = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      merged.name,
      merged.appearance,
      merged.personality,
      merged.background,
      merged.speech_style,
      merged.relationship_role,
      merged.preferred_scenes,
      merged.art_url,
      Date.now(),
      companionId,
    )
    .run();

  const updated = await loadCompanion(env, companionId);
  if (!updated) {
    return jsonResponse({ error: "internal_error" }, { status: 500 });
  }

  return jsonResponse(serializeOwnCompanion(updated));
}

async function deleteCompanion(env: Env, user: UserRecord, companionId: string): Promise<Response> {
  const existing = await loadCompanion(env, companionId);
  if (!existing) {
    return notFound();
  }

  if (existing.source !== "user") {
    return jsonResponse({ error: "forbidden_official" }, { status: 403 });
  }

  if (existing.created_by !== user.id) {
    return jsonResponse({ error: "forbidden_not_owner" }, { status: 403 });
  }

  if (existing.is_active === 0) {
    return new Response(null, { status: 204 });
  }

  await env.DB.prepare(
    `UPDATE companions SET is_active = 0, updated_at = ? WHERE id = ?`,
  )
    .bind(Date.now(), companionId)
    .run();

  return new Response(null, { status: 204 });
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function canRead(row: CompanionRow, user: UserRecord): boolean {
  if (row.is_active === 0) {
    return false;
  }
  if (row.source === "official") {
    return true;
  }
  return row.created_by === user.id;
}

async function loadCompanion(env: Env, companionId: string): Promise<CompanionRow | null> {
  return env.DB.prepare(
    `SELECT id, source, created_by, is_active, name, appearance, personality,
            background, speech_style, relationship_role, preferred_scenes,
            art_url, initial_dims, created_at, updated_at
     FROM companions
     WHERE id = ?`,
  )
    .bind(companionId)
    .first<CompanionRow>();
}

async function loadRelationship(
  env: Env,
  userId: string,
  companionId: string,
): Promise<RelationshipRow | null> {
  return env.DB.prepare(
    `SELECT closeness, trust, romance, friendship, hostility, tension, distance,
            level_label, first_met_at, last_interaction_at
     FROM relationships
     WHERE user_id = ? AND companion_id = ?`,
  )
    .bind(userId, companionId)
    .first<RelationshipRow>();
}

async function countActiveUserCompanions(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM companions WHERE created_by = ? AND source = 'user' AND is_active = 1`,
  )
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

function serializeOwnCompanion(row: CompanionRow): Record<string, unknown> {
  return {
    appearance: row.appearance,
    art_url: row.art_url,
    background: row.background,
    created_at: row.created_at,
    id: row.id,
    name: row.name,
    personality: row.personality,
    preferred_scenes: parseStringArray(row.preferred_scenes),
    relationship_role: row.relationship_role,
    source: row.source,
    speech_style: row.speech_style,
    updated_at: row.updated_at,
  };
}

type ParsedInput<T> = { value: T } | { error: true; response: Response };

type CreateValue = {
  name: string;
  appearance?: string;
  personality?: string;
  background?: string;
  speech_style?: string;
  relationship_role?: string;
  preferred_scenes?: string[];
  art_url?: string;
};

function parseCreateInput(raw: unknown): ParsedInput<CreateValue> {
  if (!isObject(raw)) {
    return invalid("invalid_body");
  }

  const name = readRequiredString(raw, "name", NAME_MAX);
  if (!name) {
    return invalid("name_required");
  }

  return {
    value: {
      appearance: readOptionalText(raw, "appearance"),
      art_url: readOptionalText(raw, "art_url", 2048),
      background: readOptionalText(raw, "background"),
      name,
      personality: readOptionalText(raw, "personality"),
      preferred_scenes: readOptionalStringArray(raw, "preferred_scenes"),
      relationship_role: readOptionalEnum(raw, "relationship_role", KNOWN_RELATIONSHIP_ROLES),
      speech_style: readOptionalText(raw, "speech_style"),
    },
  };
}

type UpdateValue = Partial<CreateValue>;

function parseUpdateInput(raw: unknown): ParsedInput<UpdateValue> {
  if (!isObject(raw)) {
    return invalid("invalid_body");
  }

  const value: UpdateValue = {};

  if ("name" in raw) {
    const name = readRequiredString(raw, "name", NAME_MAX);
    if (!name) {
      return invalid("name_required");
    }
    value.name = name;
  }

  if ("appearance" in raw) value.appearance = readOptionalText(raw, "appearance");
  if ("personality" in raw) value.personality = readOptionalText(raw, "personality");
  if ("background" in raw) value.background = readOptionalText(raw, "background");
  if ("speech_style" in raw) value.speech_style = readOptionalText(raw, "speech_style");
  if ("art_url" in raw) value.art_url = readOptionalText(raw, "art_url", 2048);
  if ("relationship_role" in raw) {
    value.relationship_role = readOptionalEnum(raw, "relationship_role", KNOWN_RELATIONSHIP_ROLES);
  }
  if ("preferred_scenes" in raw) {
    value.preferred_scenes = readOptionalStringArray(raw, "preferred_scenes") ?? [];
  }

  return { value };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(error: string): { error: true; response: Response } {
  return { error: true, response: jsonResponse({ error }, { status: 400 }) };
}

function readRequiredString(obj: Record<string, unknown>, key: string, max: number): string | null {
  const value = obj[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function readOptionalText(obj: Record<string, unknown>, key: string, max = TEXT_FIELD_MAX): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function readOptionalEnum(
  obj: Record<string, unknown>,
  key: string,
  known: ReadonlySet<string>,
): string | undefined {
  const value = obj[key];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return known.has(normalized) ? normalized : undefined;
}

function readOptionalStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const value = obj[key];
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return strings.slice(0, 32);
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
