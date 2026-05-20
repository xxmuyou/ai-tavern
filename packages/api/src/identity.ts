export type UserRecord = {
  email: string;
  id: string;
};

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
  const now = Date.now();
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, email, created_at, last_seen_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(userId, email, now, now)
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
