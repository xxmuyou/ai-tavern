import { findUserById, normalizeEmail } from "../identity";
import type { UserRecord } from "../identity";
import type { IdentityProvider } from "./types";

export { normalizeEmail } from "../identity";

export type UpsertIdentityInput = {
  provider: IdentityProvider;
  providerSubject: string;
  email: string;
  emailVerified: boolean;
  displayName?: string | null;
  now?: number;
};

export type UserWithProviders = UserRecord & {
  display_name: string | null;
  email_verified: number;
  created_at: number;
  romance_preference: "male" | "female" | "any";
  timezone: string | null;
  push_enabled: boolean;
  linked_providers: IdentityProvider[];
};

export async function upsertUserFromIdentity(
  env: Env,
  input: UpsertIdentityInput,
): Promise<UserRecord> {
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error("upsertUserFromIdentity requires a normalizable email");
  }

  const existingByIdentity = await findUserIdByIdentity(env, input.provider, input.providerSubject);
  if (existingByIdentity) {
    await applyUserMetadata(env, existingByIdentity, input);
    return loadUser(env, existingByIdentity);
  }

  const userId = await ensureUserForEmail(env, email, input);
  await insertIdentity(env, {
    userId,
    provider: input.provider,
    providerSubject: input.providerSubject,
    providerEmail: email,
    now: input.now ?? Date.now(),
  });

  // Concurrent callback may have inserted the same identity row first.
  const reconciledId = await findUserIdByIdentity(env, input.provider, input.providerSubject);
  const effectiveId = reconciledId ?? userId;

  await applyUserMetadata(env, effectiveId, input);
  return loadUser(env, effectiveId);
}

export async function listLinkedProviders(env: Env, userId: string): Promise<IdentityProvider[]> {
  const result = await env.DB.prepare(`SELECT provider FROM user_identities WHERE user_id = ?`)
    .bind(userId)
    .all<{ provider: IdentityProvider }>();

  const seen = new Set<IdentityProvider>();
  for (const row of result.results) {
    seen.add(row.provider);
  }
  return [...seen];
}

export async function loadUserWithProviders(
  env: Env,
  userId: string,
): Promise<UserWithProviders | null> {
  const row = await env.DB.prepare(
    `SELECT id, email, email_verified, display_name, created_at, romance_preference,
            timezone, push_enabled
     FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first<{
      id: string;
      email: string;
      email_verified: number;
      display_name: string | null;
      created_at: number;
      romance_preference: string | null;
      timezone: string | null;
      push_enabled: number | null;
    }>();

  if (!row) {
    return null;
  }

  const linkedProviders = await listLinkedProviders(env, userId);
  const pref = row.romance_preference;
  return {
    id: row.id,
    email: row.email,
    email_verified: row.email_verified,
    display_name: row.display_name,
    created_at: row.created_at,
    romance_preference: pref === "male" || pref === "female" ? pref : "any",
    timezone: row.timezone,
    push_enabled: row.push_enabled !== 0,
    linked_providers: linkedProviders,
  };
}

async function findUserIdByIdentity(
  env: Env,
  provider: IdentityProvider,
  providerSubject: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT user_id FROM user_identities WHERE provider = ? AND provider_subject = ?`,
  )
    .bind(provider, providerSubject)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

async function ensureUserForEmail(
  env: Env,
  email: string,
  input: UpsertIdentityInput,
): Promise<string> {
  const existing = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    return existing.id;
  }

  const userId = crypto.randomUUID();
  const now = input.now ?? Date.now();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, email, email_verified, display_name, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(userId, email, input.emailVerified ? 1 : 0, input.displayName ?? null, now, now)
    .run();

  const created = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();
  if (!created) {
    throw new Error(`failed to create or resolve user for ${email}`);
  }
  return created.id;
}

async function insertIdentity(
  env: Env,
  args: {
    userId: string;
    provider: IdentityProvider;
    providerSubject: string;
    providerEmail: string;
    now: number;
  },
): Promise<void> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO user_identities
       (id, user_id, provider, provider_subject, provider_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, args.userId, args.provider, args.providerSubject, args.providerEmail, args.now)
    .run();
}

async function applyUserMetadata(env: Env, userId: string, input: UpsertIdentityInput): Promise<void> {
  if (input.emailVerified) {
    await env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?`).bind(userId).run();
  }
  if (input.displayName) {
    await env.DB.prepare(`UPDATE users SET display_name = ? WHERE id = ? AND display_name IS NULL`)
      .bind(input.displayName, userId)
      .run();
  }
}

async function loadUser(env: Env, userId: string): Promise<UserRecord> {
  const user = await findUserById(env, userId);
  if (!user) {
    throw new Error(`upsertUserFromIdentity could not load user ${userId}`);
  }
  return user;
}
