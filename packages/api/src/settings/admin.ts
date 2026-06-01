import { requireAdminUser } from "../auth";
import { jsonResponse } from "../http";
import { loadUpdatedByEmails } from "../llm/admin/repo";
import {
  SETTINGS,
  SETTINGS_BY_KEY,
  SETTING_GROUPS,
  adminModeFor,
  type SettingDef,
  type SettingType,
} from "./registry";
import {
  invalidateSettingsCache,
  loadSettings,
  resolveSetting,
  type SettingsMap,
} from "./store";

type AppSettingRow = {
  key: string;
  value: string | null;
  updated_at: number | null;
  updated_by: string | null;
};

/**
 * Admin workspace endpoints for runtime operational settings.
 *   GET /admin/settings              — list registry + effective values
 *   PUT /admin/settings/{key}        — set (empty value resets to env default)
 *
 * Status-only secret values are never returned, revealed, or overwritten.
 */
export async function handleAdminSettingsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname === "/admin/settings") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    try {
      return await handleList(request, env);
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
  }

  const revealMatch = pathname.match(/^\/admin\/settings\/([^/]+)\/reveal$/);
  if (revealMatch) {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    try {
      return await handleReveal(request, env, decodeURIComponent(revealMatch[1] ?? ""));
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
  }

  const match = pathname.match(/^\/admin\/settings\/([^/]+)$/);
  if (match) {
    if (request.method !== "PUT") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
    }
    try {
      return await handlePut(request, env, decodeURIComponent(match[1] ?? ""));
    } catch (err) {
      if (err instanceof Response) return err;
      throw err;
    }
  }

  return null;
}

async function handleList(request: Request, env: Env): Promise<Response> {
  await requireAdminUser(env, request);

  const map = await loadSettings(env, true);
  const dbRows = await loadDbRows(env);
  const emails = await loadUpdatedByEmails(
    env,
    [...dbRows.values()].map((r) => r.updated_by).filter((id): id is string => id !== null),
  );

  const settings = await Promise.all(
    SETTINGS.map((def) => serializeSetting(env, def, map, dbRows, emails)),
  );

  return jsonResponse({ groups: SETTING_GROUPS, settings });
}

async function handlePut(request: Request, env: Env, key: string): Promise<Response> {
  const admin = await requireAdminUser(env, request);

  const def = SETTINGS_BY_KEY[key];
  if (!def) {
    return jsonResponse({ error: "unknown_setting" }, { status: 400 });
  }
  if (adminModeFor(def) === "status_only") {
    return jsonResponse({ error: "env_managed_setting" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    confirm?: unknown;
    value?: unknown;
  } | null;
  const raw = typeof body?.value === "string" ? body.value : "";
  const trimmed = raw.trim();
  if (def.dangerLevel === "high" && body?.confirm !== key) {
    return jsonResponse({ error: "confirmation_required" }, { status: 400 });
  }

  // Empty → reset to env default (delete the override).
  if (trimmed === "") {
    await env.DB.prepare(`DELETE FROM app_settings WHERE key = ?`).bind(key).run();
    invalidateSettingsCache(env);
    return jsonResponse({
      ok: true,
      setting: await loadSettingPayload(env, def),
      source: "env",
    });
  }

  const invalid = validateByType(def.type, trimmed);
  if (invalid) {
    return jsonResponse({ error: invalid }, { status: 400 });
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at, updated_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  )
    .bind(key, trimmed, now, admin.id)
    .run();
  invalidateSettingsCache(env);

  return jsonResponse({
    ok: true,
    setting: await loadSettingPayload(env, def),
    source: "db",
  });
}

async function handleReveal(request: Request, env: Env, key: string): Promise<Response> {
  await requireAdminUser(env, request);

  const def = SETTINGS_BY_KEY[key];
  if (!def) {
    return jsonResponse({ error: "unknown_setting" }, { status: 400 });
  }
  if (adminModeFor(def) === "status_only") {
    return jsonResponse({ error: "env_managed_setting" }, { status: 400 });
  }
  if (def.type !== "secret") {
    return jsonResponse({ error: "not_secret" }, { status: 400 });
  }

  const resolved = await resolveSetting(env, key, await loadSettings(env, true));
  return jsonResponse({
    env_key: def.envKey ?? null,
    key,
    source: resolved.source,
    value: resolved.value,
  });
}

async function loadSettingPayload(env: Env, def: SettingDef): Promise<Record<string, unknown>> {
  const map = await loadSettings(env, true);
  const dbRows = await loadDbRows(env);
  const emails = await loadUpdatedByEmails(
    env,
    [...dbRows.values()].map((r) => r.updated_by).filter((id): id is string => id !== null),
  );
  return serializeSetting(env, def, map, dbRows, emails);
}

async function serializeSetting(
  env: Env,
  def: SettingDef,
  map: SettingsMap,
  dbRows: Map<string, AppSettingRow>,
  emails: Map<string, string>,
): Promise<Record<string, unknown>> {
  const resolved = await resolveSetting(env, def.key, map);
  const row = dbRows.get(def.key);
  const adminMode = adminModeFor(def);
  const base = {
    admin_mode: adminMode,
    key: def.key,
    danger_level: def.dangerLevel ?? "normal",
    env_key: def.envKey ?? null,
    group: def.group,
    label: def.label,
    type: def.type,
    description: def.description ?? null,
    source: resolved.source,
    is_set: resolved.value != null && resolved.value !== "",
    updated_at: adminMode === "status_only" ? null : row?.updated_at ?? null,
    updated_by: adminMode === "status_only" ? null : row?.updated_by ? emails.get(row.updated_by) ?? null : null,
  };
  // Never leak secret values to the client.
  if (def.type === "secret") return base;
  return { ...base, value: resolved.value };
}

function validateByType(type: SettingType, value: string): string | null {
  switch (type) {
    case "number":
      return Number.isFinite(Number(value)) ? null : "invalid_number";
    case "boolean":
      return value === "true" || value === "false" ? null : "invalid_boolean";
    case "json":
      try {
        JSON.parse(value);
        return null;
      } catch {
        return "invalid_json";
      }
    default:
      return null;
  }
}

async function loadDbRows(env: Env): Promise<Map<string, AppSettingRow>> {
  const out = new Map<string, AppSettingRow>();
  try {
    const { results } = await env.DB.prepare(
      `SELECT key, value, updated_at, updated_by FROM app_settings`,
    ).all<AppSettingRow>();
    for (const row of results ?? []) out.set(row.key, row);
  } catch {
    // table missing pre-migration
  }
  return out;
}
