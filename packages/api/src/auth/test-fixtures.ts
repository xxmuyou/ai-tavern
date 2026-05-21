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
