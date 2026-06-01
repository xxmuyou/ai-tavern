/**
 * Derived URL defaults.
 *
 * Most public URLs (auth/billing redirects, image webhook, CORS origins) are
 * fixed paths under one public web root. Rather than maintain ~9 duplicated URL
 * vars per environment, we keep a single `APP_BASE_URL` env var and derive the
 * rest here.
 *
 * This is the *last* fallback in the settings resolution chain: a DB override or
 * an explicit per-item env var (the escape hatch) always wins over a derived
 * value (see settings/store.ts `pick`).
 *
 * `APP_BASE_URL` is intentionally a plain env var (redeploy to change), not an
 * admin-editable setting — it is the root every other URL derives from, so a
 * typo would break CORS, auth, billing, and webhooks at once.
 */

const LOCAL_DEV_ORIGINS = [
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
];

function readRaw(env: Env, key: string): string | null {
  const raw = (env as unknown as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

/** Public web origin from APP_BASE_URL, or null when unset/invalid. */
function baseOrigin(env: Env): string | null {
  const raw = readRaw(env, "APP_BASE_URL");
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Allowed CORS/redirect origins derived from APP_BASE_URL.
 * prod: only the app's own origin. Non-prod: also localhost dev origins.
 */
function deriveAllowedOrigins(env: Env, origin: string): string {
  const list = [origin];
  if (readRaw(env, "APP_ENV") !== "prod") {
    for (const o of LOCAL_DEV_ORIGINS) {
      if (!list.includes(o)) list.push(o);
    }
  }
  return list.join(",");
}

/**
 * Derived default for a settings key, computed from APP_BASE_URL.
 * Returns null for keys that are not URL-derivable, or when the base is unset.
 */
export function derivedSettingDefault(env: Env, key: string): string | null {
  const origin = baseOrigin(env);
  if (!origin) return null;

  switch (key) {
    case "auth.allowed_origins":
      return deriveAllowedOrigins(env, origin);
    case "auth.success_url":
      return `${origin}/auth/success`;
    case "image_gen.public_base_url":
      return `${origin}/api`;
    case "image_gen.webhook_url":
      return `${origin}/api/webhooks/runninghub`;
    case "billing.success_url":
      return `${origin}/?billing=success`;
    case "billing.cancel_url":
      return `${origin}/?billing=cancelled`;
    case "billing.portal_return_url":
      return `${origin}/?billing=portal`;
    case "billing.credits_success_url":
      return `${origin}/?credits=success`;
    case "billing.credits_cancel_url":
      return `${origin}/?credits=cancelled`;
    default:
      return null;
  }
}
