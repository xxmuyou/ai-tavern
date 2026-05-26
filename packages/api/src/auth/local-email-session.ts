import { upsertBillingCustomer } from "../billing/repository";
import { normalizeEmail } from "../identity";
import { upsertUserFromIdentity } from "./repository";
import { signSession } from "./session";
import { DEFAULT_SESSION_TTL_SECONDS, isDevRuntime } from "./types";
import type { AuthEnv, SessionResponse } from "./types";

export const LOCAL_ADMIN_EMAIL = "admin@test.com";
export const LOCAL_VIP_EMAIL = "vip@test.com";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const LOCAL_PRO_PRICE_ID = "price_local_pro";

export type LocalEmailSessionResponse = SessionResponse & {
  ok: true;
  expires_in: number;
};

export function isLocalEmailSessionRequest(request: Request, env: AuthEnv): boolean {
  if (!isDevRuntime(env)) {
    return false;
  }

  return localHostCandidates(request).some((host) => LOCAL_HOSTS.has(host));
}

export async function createLocalEmailSession(
  env: AuthEnv,
  emailInput: string,
): Promise<LocalEmailSessionResponse> {
  const email = normalizeEmail(emailInput);
  if (!email) {
    throw new Error("createLocalEmailSession requires a normalizable email");
  }

  const user = await upsertUserFromIdentity(env, {
    provider: "email",
    providerSubject: email,
    email,
    emailVerified: true,
    displayName: localDisplayName(email),
  });

  if (email === LOCAL_ADMIN_EMAIL) {
    await ensureLocalAdmin(env, email, user.id);
  }

  if (email === LOCAL_ADMIN_EMAIL || email === LOCAL_VIP_EMAIL) {
    await ensureLocalProSubscription(env, user.id, email);
  }

  const session = await signSession(env, { userId: user.id, email: user.email });
  return {
    ok: true,
    expires_in: DEFAULT_SESSION_TTL_SECONDS,
    ...session,
  };
}

function localDisplayName(email: string): string | null {
  if (email === LOCAL_ADMIN_EMAIL) {
    return "Local Admin";
  }
  if (email === LOCAL_VIP_EMAIL) {
    return "Local VIP";
  }
  return null;
}

async function ensureLocalAdmin(env: AuthEnv, email: string, userId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO admin_user_allowlist (email, note, created_at, created_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET note = excluded.note`,
  )
    .bind(email, "Localhost admin login", Date.now(), userId)
    .run();
}

async function ensureLocalProSubscription(env: AuthEnv, userId: string, email: string): Promise<void> {
  const now = Date.now();
  const currentPeriodStart = now - 60_000;
  const currentPeriodEnd = now + DEFAULT_SESSION_TTL_SECONDS * 1000;
  const stripeCustomerId = `cus_local_${userId}`;
  const subscriptionId = `sub_local_${userId}`;

  await upsertBillingCustomer(env, {
    email,
    livemode: false,
    now,
    stripeCustomerId,
    userId,
  });

  await env.DB.prepare(
    `INSERT INTO billing_subscriptions
       (id, user_id, stripe_customer_id, status, price_id, current_period_start,
        current_period_end, cancel_at_period_end, canceled_at, livemode,
        raw_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       price_id = excluded.price_id,
       current_period_start = excluded.current_period_start,
       current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end,
       canceled_at = excluded.canceled_at,
       livemode = excluded.livemode,
       raw_json = excluded.raw_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      subscriptionId,
      userId,
      stripeCustomerId,
      "active",
      LOCAL_PRO_PRICE_ID,
      currentPeriodStart,
      currentPeriodEnd,
      0,
      null,
      0,
      JSON.stringify({ source: "localhost", email }),
      now,
      now,
    )
    .run();
}

function localHostCandidates(request: Request): string[] {
  const candidates = [
    new URL(request.url).hostname,
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
    request.headers.get("origin"),
  ];

  return candidates
    .flatMap((value) => {
      if (!value) {
        return [];
      }
      try {
        return [new URL(value).hostname];
      } catch {
        return [value.split(":")[0] ?? value];
      }
    })
    .filter(Boolean);
}
