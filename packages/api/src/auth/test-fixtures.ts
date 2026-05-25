import { ensureUserByEmail } from "../identity";
import { signSession } from "./session";
import type { AuthEnv } from "./types";

export async function issueTestSessionToken(env: Env, email: string): Promise<string> {
  const user = await ensureUserByEmail(env, email);
  const session = await signSession(env as AuthEnv, { userId: user.id, email: user.email });
  return session.token;
}

export type SessionFixture = {
  id: string;
  user_id: string;
  jwt_jti: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
};

export type SessionsStoreResult =
  | { kind: "run"; result: { meta: { changes: number } } }
  | { kind: "first"; result: SessionFixture | null };

export function createSessionsStore() {
  const byJti = new Map<string, SessionFixture>();

  return {
    list(): SessionFixture[] {
      return [...byJti.values()];
    },
    getByJti(jti: string): SessionFixture | null {
      return byJti.get(jti) ?? null;
    },
    seed(session: SessionFixture): void {
      byJti.set(session.jwt_jti, session);
    },
    handle(sql: string, values: unknown[]): SessionsStoreResult | null {
      if (sql.includes("INSERT INTO sessions")) {
        const [id, userId, jti, createdAt, expiresAt] = values as [string, string, string, number, number];
        byJti.set(jti, {
          id,
          user_id: userId,
          jwt_jti: jti,
          created_at: createdAt,
          expires_at: expiresAt,
          revoked_at: null,
        });
        return { kind: "run", result: { meta: { changes: 1 } } };
      }
      if (sql.includes("FROM sessions") && sql.includes("WHERE jwt_jti = ? AND user_id = ?")) {
        const [jti, userId] = values as [string, string];
        const found = byJti.get(jti);
        return { kind: "first", result: found && found.user_id === userId ? found : null };
      }
      if (sql.includes("UPDATE sessions") && sql.includes("revoked_at = ?")) {
        const [revokedAt, jti] = values as [number, string];
        const existing = byJti.get(jti);
        const changes = existing && existing.revoked_at === null ? 1 : 0;
        if (existing && existing.revoked_at === null) {
          existing.revoked_at = revokedAt;
        }
        return { kind: "run", result: { meta: { changes } } };
      }
      return null;
    },
  };
}

export type SessionsStore = ReturnType<typeof createSessionsStore>;

export type UserFixture = {
  id: string;
  email: string;
  email_verified: number;
  display_name: string | null;
  created_at: number;
  last_seen_at: number;
};

export type UsersStoreResult =
  | { kind: "run"; result: { meta: { changes: number } } }
  | { kind: "first"; result: UserFixture | { id: string; email: string } | null };

export function createUsersStore(seed: UserFixture[] = []) {
  const byId = new Map<string, UserFixture>();
  for (const user of seed) byId.set(user.id, user);

  return {
    list(): UserFixture[] {
      return [...byId.values()];
    },
    getById(id: string): UserFixture | null {
      return byId.get(id) ?? null;
    },
    getByEmail(email: string): UserFixture | null {
      return [...byId.values()].find((u) => u.email === email) ?? null;
    },
    seed(user: UserFixture): void {
      byId.set(user.id, user);
    },
    handle(sql: string, values: unknown[]): UsersStoreResult | null {
      if (sql.includes("INSERT INTO users") || sql.includes("INSERT OR IGNORE INTO users")) {
        const params = values as unknown[];
        const id = params[0] as string;
        const email = params[1] as string;
        if (!byId.has(id) && ![...byId.values()].some((u) => u.email === email)) {
          // Detect full-fields INSERT vs ensureUserByEmail's 4-column INSERT
          if (params.length >= 6) {
            byId.set(id, {
              id,
              email,
              email_verified: (params[2] as number) ?? 0,
              display_name: (params[3] as string | null) ?? null,
              created_at: params[4] as number,
              last_seen_at: params[5] as number,
            });
          } else {
            byId.set(id, {
              id,
              email,
              email_verified: 0,
              display_name: null,
              created_at: (params[2] as number) ?? Date.now(),
              last_seen_at: (params[3] as number) ?? Date.now(),
            });
          }
          return { kind: "run", result: { meta: { changes: 1 } } };
        }
        return { kind: "run", result: { meta: { changes: 0 } } };
      }
      if (sql.includes("UPDATE users SET email_verified = 1") && sql.includes("WHERE id = ?")) {
        const [id] = values as [string];
        const user = byId.get(id);
        if (user) {
          user.email_verified = 1;
          return { kind: "run", result: { meta: { changes: 1 } } };
        }
        return { kind: "run", result: { meta: { changes: 0 } } };
      }
      if (sql.includes("UPDATE users SET display_name") && sql.includes("display_name IS NULL")) {
        const [name, id] = values as [string, string];
        const user = byId.get(id);
        if (user && user.display_name === null) {
          user.display_name = name;
          return { kind: "run", result: { meta: { changes: 1 } } };
        }
        return { kind: "run", result: { meta: { changes: 0 } } };
      }
      if (sql.includes("FROM users") && sql.includes("WHERE email = ?")) {
        const [email] = values as [string];
        return { kind: "first", result: this.getByEmail(email) };
      }
      if (sql.includes("FROM users") && sql.includes("WHERE id = ?")) {
        const [id] = values as [string];
        return { kind: "first", result: this.getById(id) };
      }
      return null;
    },
  };
}

export type UsersStore = ReturnType<typeof createUsersStore>;

export type IdentityFixture = {
  id: string;
  user_id: string;
  provider: string;
  provider_subject: string;
  provider_email: string | null;
  created_at: number;
};

export type IdentitiesStoreResult =
  | { kind: "run"; result: { meta: { changes: number } } }
  | { kind: "first"; result: IdentityFixture | { user_id: string } | null }
  | { kind: "all"; result: IdentityFixture[] };

export function createIdentitiesStore() {
  const rows: IdentityFixture[] = [];

  return {
    list(): IdentityFixture[] {
      return [...rows];
    },
    seed(identity: IdentityFixture): void {
      rows.push(identity);
    },
    handle(sql: string, values: unknown[]): IdentitiesStoreResult | null {
      if (sql.includes("INSERT INTO user_identities") || sql.includes("INSERT OR IGNORE INTO user_identities")) {
        const [id, userId, provider, subject, email, createdAt] = values as [
          string,
          string,
          string,
          string,
          string | null,
          number,
        ];
        const conflict = rows.some((r) => r.provider === provider && r.provider_subject === subject);
        if (conflict) {
          return { kind: "run", result: { meta: { changes: 0 } } };
        }
        rows.push({
          id,
          user_id: userId,
          provider,
          provider_subject: subject,
          provider_email: email,
          created_at: createdAt,
        });
        return { kind: "run", result: { meta: { changes: 1 } } };
      }
      if (
        sql.includes("FROM user_identities") &&
        sql.includes("WHERE provider = ? AND provider_subject = ?")
      ) {
        const [provider, subject] = values as [string, string];
        const found = rows.find((r) => r.provider === provider && r.provider_subject === subject) ?? null;
        return { kind: "first", result: found };
      }
      if (sql.includes("FROM user_identities") && sql.includes("WHERE user_id = ?")) {
        const [userId] = values as [string];
        return { kind: "all", result: rows.filter((r) => r.user_id === userId) };
      }
      return null;
    },
  };
}

export type IdentitiesStore = ReturnType<typeof createIdentitiesStore>;

type KvEntry = { value: string; expiresAt: number | null };

export type KvStore = {
  raw: Map<string, KvEntry>;
  asKV(): KVNamespace;
};

export function createKvStore(): KvStore {
  const raw = new Map<string, KvEntry>();

  const isExpired = (entry: KvEntry): boolean => {
    if (entry.expiresAt === null) return false;
    return entry.expiresAt <= Date.now();
  };

  const namespace: KVNamespace = {
    async get(key: string, options?: KVNamespaceGetOptions<unknown> | "text" | "json") {
      const entry = raw.get(key);
      if (!entry || isExpired(entry)) {
        raw.delete(key);
        return null;
      }
      if (options === "json" || (typeof options === "object" && options?.type === "json")) {
        return JSON.parse(entry.value);
      }
      return entry.value;
    },
    async put(key: string, value: string, options?: KVNamespacePutOptions) {
      const ttl = options?.expirationTtl;
      raw.set(key, {
        value: typeof value === "string" ? value : String(value),
        expiresAt: ttl ? Date.now() + ttl * 1000 : null,
      });
    },
    async delete(key: string) {
      raw.delete(key);
    },
    async list() {
      return { keys: [...raw.keys()].map((name) => ({ name })), list_complete: true, cacheStatus: null };
    },
    async getWithMetadata() {
      return { value: null, metadata: null, cacheStatus: null };
    },
  } as unknown as KVNamespace;

  return {
    raw,
    asKV: () => namespace,
  };
}

