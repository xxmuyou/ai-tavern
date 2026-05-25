import { describe, expect, it } from "vitest";

import { isAdminEmail, requireAdminUser, requireAuthEmail } from "./auth";
import { createSessionsStore, issueTestSessionToken, type SessionsStore } from "./auth/test-fixtures";

describe("auth tokens and admin gating", () => {
  it("issues a token and prefers token email over request email", async () => {
    const env = createAuthEnv("dev");
    const token = await issueTestSessionToken(env, "player@example.com");

    const email = await requireAuthEmail(
      env,
      new Request("http://localhost/shows/dating-heart-signal/workspace?email=attacker@example.com", {
        headers: { authorization: `Bearer ${token}` },
      }),
      "attacker@example.com",
    );

    expect(email).toBe("player@example.com");
  });

  it("rejects plain email fallback in production", async () => {
    await expect(
      requireAuthEmail(
        createAuthEnv("prod"),
        new Request("https://aiappsbox.com/shows/dating-heart-signal/workspace"),
        "player@example.com",
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("allows admin emails from the environment whitelist", async () => {
    const env = createAuthEnv("dev", "owner@example.com,admin@aiappsbox.com");
    expect(isAdminEmail(env, "owner@example.com")).toBe(true);
    expect(isAdminEmail(env, "player@example.com")).toBe(false);

    const token = await issueTestSessionToken(env, "owner@example.com");
    await expect(
      requireAdminUser(env, new Request("http://localhost/admin", {
        headers: { authorization: `Bearer ${token}` },
      })),
    ).resolves.toMatchObject({ email: "owner@example.com" });
  });

  it("rejects non-admin authenticated users from admin endpoints", async () => {
    const env = createAuthEnv("dev", "owner@example.com");
    const token = await issueTestSessionToken(env, "player@example.com");

    await expect(
      requireAdminUser(env, new Request("http://localhost/admin", {
        headers: { authorization: `Bearer ${token}` },
      })),
    ).rejects.toMatchObject({ status: 403 });
  });
});

function createAuthEnv(
  appEnv: "dev" | "prod",
  adminEmails?: string,
): Env & { sessionsStore: SessionsStore } {
  const users = new Map<string, { email: string; id: string }>();
  const sessionsStore = createSessionsStore();
  return {
    ADMIN_EMAILS: adminEmails,
    APP_ENV: appEnv,
    AUTH_TOKEN_SECRET: "test-auth-secret",
    sessionsStore,
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first() {
                const sessionResult = sessionsStore.handle(sql, values);
                if (sessionResult?.kind === "first") {
                  return sessionResult.result;
                }

                if (sql.includes("FROM users")) {
                  if (sql.includes("WHERE email = ?")) {
                    return users.get((values[0] as string) ?? "") ?? null;
                  }
                  if (sql.includes("WHERE id = ?")) {
                    return [...users.values()].find((user) => user.id === values[0]) ?? null;
                  }
                }

                return null;
              },
              async run() {
                const sessionResult = sessionsStore.handle(sql, values);
                if (sessionResult?.kind === "run") {
                  return sessionResult.result;
                }

                if (sql.includes("INSERT OR IGNORE INTO users")) {
                  const [id, email] = values as [string, string];
                  if (id && email && !users.has(email)) {
                    users.set(email, { email, id });
                  }
                }

                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  } as unknown as Env & { sessionsStore: SessionsStore };
}
