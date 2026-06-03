import { requireAuthUser } from "../auth";
import { jsonResponse, notFound, readJson } from "../http";
import type { UserRecord } from "../identity";

const NAME_MAX = 80;
const DESCRIPTION_MAX = 4000;
const GENDER_MAX = 32;

export type PersonaRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  gender: string | null;
  is_default: number;
  is_active: number;
  created_at: number;
  updated_at: number;
};

export type PersonaPublic = {
  id: string;
  name: string;
  description: string | null;
  gender: string | null;
  is_default: boolean;
  created_at: number;
  updated_at: number;
};

function toPublic(row: PersonaRow): PersonaPublic {
  return {
    created_at: row.created_at,
    description: row.description,
    gender: row.gender,
    id: row.id,
    is_default: row.is_default === 1,
    name: row.name,
    updated_at: row.updated_at,
  };
}

export async function handlePersonasRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/personas") {
    const user = await requireAuthUser(env, request);
    if (request.method === "GET") return listPersonas(env, user);
    if (request.method === "POST") return createPersona(request, env, user);
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const match = pathname.match(/^\/personas\/([^/]+)$/);
  if (!match) return null;

  const personaId = decodeURIComponent(match[1] ?? "");
  if (!personaId) {
    return jsonResponse({ error: "invalid_persona_id" }, { status: 400 });
  }
  const user = await requireAuthUser(env, request);
  if (request.method === "PATCH") return updatePersona(request, env, user, personaId);
  if (request.method === "DELETE") return deletePersona(env, user, personaId);
  return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
}

async function listPersonas(env: Env, user: UserRecord): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, name, description, gender, is_default, is_active, created_at, updated_at
     FROM user_personas
     WHERE user_id = ? AND is_active = 1
     ORDER BY is_default DESC, created_at ASC`,
  )
    .bind(user.id)
    .all<PersonaRow>();

  return jsonResponse({ personas: (results ?? []).map(toPublic) });
}

type PersonaBody = {
  name?: unknown;
  description?: unknown;
  gender?: unknown;
  is_default?: unknown;
};

function parseField(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

async function createPersona(request: Request, env: Env, user: UserRecord): Promise<Response> {
  let body: PersonaBody;
  try {
    body = await readJson<PersonaBody>(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonResponse({ error: "invalid_request" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, NAME_MAX) : "";
  if (!name) {
    return jsonResponse({ error: "invalid_request", field: "name" }, { status: 400 });
  }
  const description = parseField(body.description, DESCRIPTION_MAX) ?? null;
  const gender = parseField(body.gender, GENDER_MAX) ?? null;

  // The first persona is always the default; honour an explicit request too.
  const existingCount = await countActivePersonas(env, user.id);
  const makeDefault = existingCount === 0 || body.is_default === true;

  const id = crypto.randomUUID();
  const now = Date.now();

  if (makeDefault) {
    await clearDefault(env, user.id);
  }
  await env.DB.prepare(
    `INSERT INTO user_personas
       (id, user_id, name, description, gender, is_default, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  )
    .bind(id, user.id, name, description, gender, makeDefault ? 1 : 0, now, now)
    .run();

  const row = await loadPersona(env, user.id, id);
  return jsonResponse({ persona: row ? toPublic(row) : null }, { status: 201 });
}

async function updatePersona(
  request: Request,
  env: Env,
  user: UserRecord,
  personaId: string,
): Promise<Response> {
  const existing = await loadPersona(env, user.id, personaId);
  if (!existing) return notFound();

  let body: PersonaBody;
  try {
    body = await readJson<PersonaBody>(request);
  } catch (err) {
    if (err instanceof Response) return err;
    return jsonResponse({ error: "invalid_request" }, { status: 400 });
  }

  const name =
    body.name === undefined
      ? existing.name
      : typeof body.name === "string"
        ? body.name.trim().slice(0, NAME_MAX)
        : "";
  if (!name) {
    return jsonResponse({ error: "invalid_request", field: "name" }, { status: 400 });
  }

  const descriptionField = parseField(body.description, DESCRIPTION_MAX);
  const description = descriptionField === undefined ? existing.description : descriptionField;
  const genderField = parseField(body.gender, GENDER_MAX);
  const gender = genderField === undefined ? existing.gender : genderField;

  const now = Date.now();
  // Setting is_default true promotes this persona and demotes the rest. We never
  // let a user clear the default flag directly — there is always exactly one
  // default once any persona exists.
  if (body.is_default === true && existing.is_default !== 1) {
    await clearDefault(env, user.id);
  }
  const makeDefault = body.is_default === true ? 1 : existing.is_default;

  await env.DB.prepare(
    `UPDATE user_personas
     SET name = ?, description = ?, gender = ?, is_default = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(name, description, gender, makeDefault, now, personaId, user.id)
    .run();

  const row = await loadPersona(env, user.id, personaId);
  return jsonResponse({ persona: row ? toPublic(row) : null });
}

async function deletePersona(env: Env, user: UserRecord, personaId: string): Promise<Response> {
  const existing = await loadPersona(env, user.id, personaId);
  if (!existing) return notFound();

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE user_personas SET is_active = 0, is_default = 0, updated_at = ? WHERE id = ? AND user_id = ?`,
  )
    .bind(now, personaId, user.id)
    .run();

  // Promote another persona to default if we just removed the default one, so a
  // user is never left with personas but no default.
  if (existing.is_default === 1) {
    const next = await env.DB.prepare(
      `SELECT id FROM user_personas
       WHERE user_id = ? AND is_active = 1
       ORDER BY created_at ASC LIMIT 1`,
    )
      .bind(user.id)
      .first<{ id: string }>();
    if (next) {
      await env.DB.prepare(
        `UPDATE user_personas SET is_default = 1, updated_at = ? WHERE id = ?`,
      )
        .bind(now, next.id)
        .run();
    }
  }

  return jsonResponse({ ok: true });
}

async function countActivePersonas(env: Env, userId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM user_personas WHERE user_id = ? AND is_active = 1`,
  )
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function clearDefault(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE user_personas SET is_default = 0 WHERE user_id = ? AND is_default = 1`,
  )
    .bind(userId)
    .run();
}

export async function loadPersona(
  env: Env,
  userId: string,
  personaId: string,
): Promise<PersonaRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, name, description, gender, is_default, is_active, created_at, updated_at
     FROM user_personas
     WHERE id = ? AND user_id = ? AND is_active = 1`,
  )
    .bind(personaId, userId)
    .first<PersonaRow>();
}

export async function loadDefaultPersona(env: Env, userId: string): Promise<PersonaRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, name, description, gender, is_default, is_active, created_at, updated_at
     FROM user_personas
     WHERE user_id = ? AND is_active = 1
     ORDER BY is_default DESC, created_at ASC
     LIMIT 1`,
  )
    .bind(userId)
    .first<PersonaRow>();
}

/**
 * Resolve which persona a thread should speak as: its bound persona if still
 * active, otherwise the user's default persona, otherwise null.
 */
export async function resolveThreadPersona(
  env: Env,
  userId: string,
  personaId: string | null,
): Promise<PersonaRow | null> {
  if (personaId) {
    const bound = await loadPersona(env, userId, personaId);
    if (bound) return bound;
  }
  return loadDefaultPersona(env, userId);
}
