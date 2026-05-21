import { describe, expect, it } from "vitest";

import { listLinkedProviders, loadUserWithProviders, upsertUserFromIdentity } from "./repository";
import {
  createIdentitiesStore,
  createUsersStore,
  type IdentitiesStore,
  type UsersStore,
} from "./test-fixtures";

describe("upsertUserFromIdentity", () => {
  it("creates a new user + identity when neither exists", async () => {
    const env = createEnv();
    const user = await upsertUserFromIdentity(env, {
      provider: "google",
      providerSubject: "gid-1",
      email: "Player@Example.com",
      emailVerified: true,
      displayName: "Player",
      now: 1_700_000_000_000,
    });

    expect(user.email).toBe("player@example.com");

    const stored = env.usersStore.getByEmail("player@example.com");
    expect(stored).toMatchObject({
      email: "player@example.com",
      email_verified: 1,
      display_name: "Player",
    });

    const identities = env.identitiesStore.list();
    expect(identities).toHaveLength(1);
    expect(identities[0]).toMatchObject({
      provider: "google",
      provider_subject: "gid-1",
      provider_email: "player@example.com",
      user_id: stored?.id,
    });
  });

  it("returns existing user when identity already linked", async () => {
    const env = createEnv();
    const first = await upsertUserFromIdentity(env, {
      provider: "google",
      providerSubject: "gid-1",
      email: "player@example.com",
      emailVerified: true,
    });

    const second = await upsertUserFromIdentity(env, {
      provider: "google",
      providerSubject: "gid-1",
      email: "player@example.com",
      emailVerified: true,
    });

    expect(second.id).toBe(first.id);
    expect(env.identitiesStore.list()).toHaveLength(1);
  });

  it("links a new provider to existing user when email matches", async () => {
    const env = createEnv();
    const google = await upsertUserFromIdentity(env, {
      provider: "google",
      providerSubject: "gid-1",
      email: "player@example.com",
      emailVerified: true,
    });

    const magicLink = await upsertUserFromIdentity(env, {
      provider: "email",
      providerSubject: "player@example.com",
      email: "player@example.com",
      emailVerified: true,
    });

    expect(magicLink.id).toBe(google.id);
    const identities = env.identitiesStore.list();
    expect(identities).toHaveLength(2);
    expect(identities.map((i) => i.provider).sort()).toEqual(["email", "google"]);
  });

  it("does not overwrite an existing display_name", async () => {
    const env = createEnv();
    await upsertUserFromIdentity(env, {
      provider: "google",
      providerSubject: "gid-1",
      email: "player@example.com",
      emailVerified: true,
      displayName: "Original",
    });

    await upsertUserFromIdentity(env, {
      provider: "google",
      providerSubject: "gid-1",
      email: "player@example.com",
      emailVerified: true,
      displayName: "Renamed",
    });

    expect(env.usersStore.getByEmail("player@example.com")?.display_name).toBe("Original");
  });

  it("flips email_verified=1 on subsequent verified login", async () => {
    const env = createEnv();
    // Seed an unverified user (e.g. created earlier by ensureUserByEmail in dev-session)
    env.usersStore.handle(
      "INSERT OR IGNORE INTO users (id, email, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
      ["u-pre", "player@example.com", 1, 1],
    );
    expect(env.usersStore.getByEmail("player@example.com")?.email_verified).toBe(0);

    const result = await upsertUserFromIdentity(env, {
      provider: "google",
      providerSubject: "gid-1",
      email: "player@example.com",
      emailVerified: true,
    });

    expect(result.id).toBe("u-pre");
    expect(env.usersStore.getByEmail("player@example.com")?.email_verified).toBe(1);
  });

  it("rejects unparseable email", async () => {
    const env = createEnv();
    await expect(
      upsertUserFromIdentity(env, {
        provider: "google",
        providerSubject: "gid-1",
        email: "no-at-sign",
        emailVerified: true,
      }),
    ).rejects.toThrow(/normalizable email/);
  });
});

describe("listLinkedProviders", () => {
  it("returns deduped providers for a user", async () => {
    const env = createEnv();
    const user = await upsertUserFromIdentity(env, {
      provider: "google",
      providerSubject: "gid-1",
      email: "a@b.com",
      emailVerified: true,
    });
    await upsertUserFromIdentity(env, {
      provider: "email",
      providerSubject: "a@b.com",
      email: "a@b.com",
      emailVerified: true,
    });

    const providers = await listLinkedProviders(env, user.id);
    expect(providers.sort()).toEqual(["email", "google"]);
  });
});

describe("loadUserWithProviders", () => {
  it("returns user with linked providers and metadata", async () => {
    const env = createEnv();
    const user = await upsertUserFromIdentity(env, {
      provider: "google",
      providerSubject: "gid-1",
      email: "player@example.com",
      emailVerified: true,
      displayName: "Player",
      now: 5_000,
    });

    const detailed = await loadUserWithProviders(env, user.id);
    expect(detailed).toMatchObject({
      id: user.id,
      email: "player@example.com",
      email_verified: 1,
      display_name: "Player",
      created_at: 5_000,
      linked_providers: ["google"],
    });
  });

  it("returns null for unknown user id", async () => {
    const env = createEnv();
    expect(await loadUserWithProviders(env, "nope")).toBeNull();
  });
});

function createEnv(): Env & { usersStore: UsersStore; identitiesStore: IdentitiesStore } {
  const usersStore = createUsersStore();
  const identitiesStore = createIdentitiesStore();
  return {
    APP_ENV: "dev",
    usersStore,
    identitiesStore,
    DB: {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first() {
                const userResult = usersStore.handle(sql, values);
                if (userResult?.kind === "first") return userResult.result;
                const idResult = identitiesStore.handle(sql, values);
                if (idResult?.kind === "first") return idResult.result;
                return null;
              },
              async all() {
                const idResult = identitiesStore.handle(sql, values);
                if (idResult?.kind === "all") return { results: idResult.result };
                return { results: [] };
              },
              async run() {
                const userResult = usersStore.handle(sql, values);
                if (userResult?.kind === "run") return userResult.result;
                const idResult = identitiesStore.handle(sql, values);
                if (idResult?.kind === "run") return idResult.result;
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  } as unknown as Env & { usersStore: UsersStore; identitiesStore: IdentitiesStore };
}
