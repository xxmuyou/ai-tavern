export const PLATFORM_APP_KEY = "platform";

export type UserRecord = {
  email: string;
  id: string;
};

export function normalizeAppKey(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-z0-9-]{1,64}$/.test(normalized) ? normalized : PLATFORM_APP_KEY;
}

export function normalizeEmail(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : undefined;
}

export async function ensureUserByEmail(
  env: Env,
  email: string,
  preferredUserId?: string,
): Promise<UserRecord> {
  if (preferredUserId) {
    const existingById = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?")
      .bind(preferredUserId)
      .first<UserRecord>();

    if (existingById) {
      return existingById;
    }
  }

  const existingByEmail = await env.DB.prepare("SELECT id, email FROM users WHERE email = ?")
    .bind(email)
    .first<UserRecord>();

  if (existingByEmail) {
    return existingByEmail;
  }

  const userId = preferredUserId ?? crypto.randomUUID();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, email, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)`,
  )
    .bind(userId, email)
    .run();

  const created = await env.DB.prepare("SELECT id, email FROM users WHERE email = ?")
    .bind(email)
    .first<UserRecord>();

  if (!created) {
    throw new Response("Failed to resolve user", { status: 500 });
  }

  return created;
}

export async function findUserById(env: Env, userId: string): Promise<UserRecord | null> {
  return env.DB.prepare("SELECT id, email FROM users WHERE id = ?").bind(userId).first<UserRecord>();
}
