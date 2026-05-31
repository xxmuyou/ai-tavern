import { SETTINGS_BY_KEY } from "./registry";

/**
 * Runtime settings store: reads admin-managed config from the `app_settings`
 * D1 table, falling back to env vars when there's no DB override.
 *
 * Values are cached per-isolate (keyed by the env object) with a short TTL so
 * hot paths (chat, rate limiting) don't hit D1 on every request. A write
 * invalidates this isolate's cache immediately; other isolates converge within
 * the TTL.
 */
const TTL_MS = 30_000;

type CacheEntry = { at: number; map: Map<string, string> };
const cacheByEnv = new WeakMap<object, CacheEntry>();

export async function loadSettings(env: Env, fresh = false): Promise<Map<string, string>> {
  const now = Date.now();
  const cached = cacheByEnv.get(env as object);
  if (!fresh && cached && now - cached.at < TTL_MS) {
    return cached.map;
  }

  const map = new Map<string, string>();
  try {
    const { results } = await env.DB.prepare(
      `SELECT key, value FROM app_settings`,
    ).all<{ key: string; value: string | null }>();
    for (const row of results ?? []) {
      if (typeof row.value === "string" && row.value.trim() !== "") {
        map.set(row.key, row.value);
      }
    }
  } catch {
    // Table may not exist yet (pre-migration) — treat as empty so env fallback
    // keeps existing deployments working.
  }

  cacheByEnv.set(env as object, { at: now, map });
  return map;
}

export function invalidateSettingsCache(env: Env): void {
  cacheByEnv.delete(env as object);
}

function readEnv(env: Env, envKey: string | undefined): string | null {
  if (!envKey) return null;
  const raw = (env as unknown as Record<string, unknown>)[envKey];
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

/** DB override (non-empty) wins; otherwise the registered env fallback. */
function pick(env: Env, map: Map<string, string>, key: string): string | null {
  const dbVal = map.get(key);
  if (typeof dbVal === "string" && dbVal.trim() !== "") return dbVal.trim();
  return readEnv(env, SETTINGS_BY_KEY[key]?.envKey);
}

export async function getSetting(env: Env, key: string): Promise<string | null> {
  const map = await loadSettings(env);
  return pick(env, map, key);
}

export type ResolvedSetting = { value: string | null; source: "db" | "env" | "unset" };

/** Like getSetting, but also reports where the value came from (for admin UI). */
export async function resolveSetting(
  env: Env,
  key: string,
  map?: Map<string, string>,
): Promise<ResolvedSetting> {
  const m = map ?? (await loadSettings(env));
  const dbVal = m.get(key);
  if (typeof dbVal === "string" && dbVal.trim() !== "") {
    return { value: dbVal.trim(), source: "db" };
  }
  const envVal = readEnv(env, SETTINGS_BY_KEY[key]?.envKey);
  return envVal != null ? { value: envVal, source: "env" } : { value: null, source: "unset" };
}

export async function getSettingNumber(
  env: Env,
  key: string,
  fallback: number,
): Promise<number> {
  const raw = await getSetting(env, key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type ImageGenConfig = {
  provider: string;
  publicBaseUrl: string | null;
  runninghubBaseUrl: string | null;
  apiKey: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
  r2SigningKey: string | null;
  createWorkflows: string | null;
  wf2: {
    workflowId: string | null;
    loadImageNodeId: string | null;
    promptNodeId: string | null;
  };
};

/** Resolve the full image-gen config in one settings load. */
export async function resolveImageGenConfig(env: Env): Promise<ImageGenConfig> {
  const map = await loadSettings(env);
  const p = (key: string) => pick(env, map, key);
  return {
    provider: p("image_gen.provider") ?? "mock",
    publicBaseUrl: p("image_gen.public_base_url"),
    runninghubBaseUrl: p("image_gen.runninghub_base_url"),
    apiKey: p("image_gen.api_key"),
    webhookUrl: p("image_gen.webhook_url"),
    webhookSecret: p("image_gen.webhook_secret"),
    r2SigningKey: p("image_gen.r2_signing_key"),
    createWorkflows: p("image_gen.create_workflows"),
    wf2: {
      workflowId: p("image_gen.wf2_workflow_id"),
      loadImageNodeId: p("image_gen.wf2_load_image_node_id"),
      promptNodeId: p("image_gen.wf2_prompt_node_id"),
    },
  };
}
