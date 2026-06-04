import { derivedSettingDefault } from "./derived-urls";
import { adminModeFor, SETTINGS_BY_KEY } from "./registry";

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

export type SettingsMap = Map<string, string>;

type CacheEntry = { at: number; map: SettingsMap };
const cacheByEnv = new WeakMap<object, CacheEntry>();

export async function loadSettings(env: Env, fresh = false): Promise<SettingsMap> {
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
  const def = SETTINGS_BY_KEY[key];
  if (adminModeFor(def) === "status_only") return readEnv(env, def?.envKey);

  const dbVal = map.get(key);
  if (typeof dbVal === "string" && dbVal.trim() !== "") return dbVal.trim();
  return readEnv(env, def?.envKey) ?? derivedSettingDefault(env, key);
}

export async function getSetting(env: Env, key: string): Promise<string | null> {
  const map = await loadSettings(env);
  return pick(env, map, key);
}

export type ResolvedSetting = { value: string | null; source: "db" | "env" | "derived" | "unset" };

/** Like getSetting, but also reports where the value came from (for admin UI). */
export async function resolveSetting(
  env: Env,
  key: string,
  map?: Map<string, string>,
): Promise<ResolvedSetting> {
  const m = map ?? (await loadSettings(env));
  const def = SETTINGS_BY_KEY[key];
  if (adminModeFor(def) === "status_only") {
    const envVal = readEnv(env, def?.envKey);
    return envVal != null ? { value: envVal, source: "env" } : { value: null, source: "unset" };
  }

  const dbVal = m.get(key);
  if (typeof dbVal === "string" && dbVal.trim() !== "") {
    return { value: dbVal.trim(), source: "db" };
  }
  const envVal = readEnv(env, def?.envKey);
  if (envVal != null) return { value: envVal, source: "env" };
  const derived = derivedSettingDefault(env, key);
  return derived != null ? { value: derived, source: "derived" } : { value: null, source: "unset" };
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
  wf1Provider: string | null;
  wf2Provider: string | null;
  wfMomentProvider: string | null;
  wfSceneProvider: string | null;
  wfCutoutProvider: string | null;
  wfOutfitProvider: string | null;
  wf1BasePrompt: string | null;
  wfMomentBasePrompt: string | null;
  publicBaseUrl: string | null;
  runninghubBaseUrl: string | null;
  apiKey: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
  r2SigningKey: string | null;
  /** Unified RunningHub workflow wiring (JSON keyed by workflow key). */
  workflows: string | null;
  openai: {
    apiKey: string | null;
    model: string;
    size: string;
  };
};

/** Resolve the full image-gen config in one settings load. */
export async function resolveImageGenConfig(env: Env): Promise<ImageGenConfig> {
  const map = await loadSettings(env);
  const p = (key: string) => pick(env, map, key);
  return {
    provider: p("image_gen.provider") ?? "mock",
    wf1Provider: p("image_gen.wf1_provider"),
    wf2Provider: p("image_gen.wf2_provider"),
    wfMomentProvider: p("image_gen.wf_moment_provider"),
    wfSceneProvider: p("image_gen.wf_scene_provider"),
    wfCutoutProvider: p("image_gen.wf_cutout_provider"),
    wfOutfitProvider: p("image_gen.wf_outfit_provider"),
    wf1BasePrompt: p("image_gen.wf1_base_prompt"),
    wfMomentBasePrompt: p("image_gen.wf_moment_base_prompt"),
    publicBaseUrl: p("image_gen.public_base_url"),
    runninghubBaseUrl: p("image_gen.runninghub_base_url"),
    apiKey: p("image_gen.api_key"),
    webhookUrl: p("image_gen.webhook_url"),
    webhookSecret: p("image_gen.webhook_secret"),
    r2SigningKey: p("image_gen.r2_signing_key"),
    workflows: p("image_gen.workflows"),
    openai: {
      apiKey: p("image_gen.openai_api_key"),
      model: p("image_gen.openai_model") ?? "gpt-image-1",
      size: p("image_gen.openai_image_size") ?? "1024x1024",
    },
  };
}
