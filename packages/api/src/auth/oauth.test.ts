import { describe, expect, it, vi } from "vitest";

import { handleOAuthCallback, handleOAuthStart } from "./oauth";
import type { OAuthExchangeResult, OAuthProvider, ProviderResolver } from "./providers";
import { getOAuthProvider } from "./providers";
import {
  createIdentitiesStore,
  createKvStore,
  createSessionsStore,
  createUsersStore,
  type IdentitiesStore,
  type KvStore,
  type SessionsStore,
  type UsersStore,
} from "./test-fixtures";
import { authError } from "./types";
import type { AuthEnv } from "./types";

const SUCCESS_URL = "https://dev.aiappsbox.com/auth/success";

describe("handleOAuthStart", () => {
  it("writes state to KV and redirects to provider authorize URL", async () => {
    const env = createEnv();
    const resolver = fakeResolver(fakeGoogle());
    const response = await handleOAuthStart(
      new Request("https://api.example.com/auth/oidc/google/start?redirect=/dashboard"),
      env,
      "google",
      resolver,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://accounts.fake/authorize?state=test-state",
    );
    const stored = env.kvStore.raw.get("oauth:state:test-state");
    expect(stored).toBeDefined();
    expect(JSON.parse(stored!.value)).toMatchObject({
      provider: "google",
      redirect: "/dashboard",
    });
  });

  it("falls back to AUTH_SUCCESS_URL when redirect is invalid", async () => {
    const env = createEnv();
    const resolver = fakeResolver(fakeGoogle());
    await handleOAuthStart(
      new Request("https://api.example.com/auth/oidc/google/start?redirect=//evil.com/x"),
      env,
      "google",
      resolver,
    );

    const stored = env.kvStore.raw.get("oauth:state:test-state");
    const parsed = JSON.parse(stored!.value);
    expect(parsed.redirect).toBe(SUCCESS_URL);
  });

  it("returns 400 provider_not_configured when provider resolver throws", async () => {
    const env = createEnv();
    const resolver: ProviderResolver = () => {
      throw authError("provider_not_configured", 400);
    };
    const response = await handleOAuthStart(
      new Request("https://api.example.com/auth/oidc/google/start"),
      env,
      "google",
      resolver,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("provider_not_configured");
  });
});

describe("handleOAuthCallback", () => {
  it("returns invalid_oauth_state when state is missing in KV", async () => {
    const env = createEnv();
    const resolver = fakeResolver(fakeGoogle());
    const response = await handleOAuthCallback(
      new Request("https://api.example.com/auth/oidc/google/callback?code=c&state=missing"),
      env,
      "google",
      resolver,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${SUCCESS_URL}?error=invalid_oauth_state`);
  });

  it("returns invalid_oauth_state when code is missing", async () => {
    const env = createEnv();
    const resolver = fakeResolver(fakeGoogle());
    const response = await handleOAuthCallback(
      new Request("https://api.example.com/auth/oidc/google/callback?state=x"),
      env,
      "google",
      resolver,
    );
    expect(response.headers.get("location")).toBe(`${SUCCESS_URL}?error=invalid_oauth_state`);
  });

  it("treats state as one-shot — second use returns invalid_oauth_state", async () => {
    const env = createEnv();
    await env.kvStore.asKV().put(
      "oauth:state:abc",
      JSON.stringify({ provider: "google", redirect: "/dashboard", created_at: 1 }),
    );

    const provider = fakeGoogle({
      exchangeResult: {
        providerSubject: "gid-1",
        email: "player@example.com",
        emailVerified: true,
        displayName: "Player",
      },
    });
    const resolver = fakeResolver(provider);

    const first = await handleOAuthCallback(
      new Request("https://api.example.com/auth/oidc/google/callback?code=c&state=abc"),
      env,
      "google",
      resolver,
    );
    expect(first.status).toBe(302);
    expect(first.headers.get("location")).toContain("#token=");

    const second = await handleOAuthCallback(
      new Request("https://api.example.com/auth/oidc/google/callback?code=c&state=abc"),
      env,
      "google",
      resolver,
    );
    expect(second.headers.get("location")).toBe(`${SUCCESS_URL}?error=invalid_oauth_state`);
  });

  it("returns invalid_oauth_state when state provider mismatches", async () => {
    const env = createEnv();
    await env.kvStore.asKV().put(
      "oauth:state:abc",
      JSON.stringify({ provider: "apple", redirect: "/", created_at: 1 }),
    );
    const resolver = fakeResolver(fakeGoogle());
    const response = await handleOAuthCallback(
      new Request("https://api.example.com/auth/oidc/google/callback?code=c&state=abc"),
      env,
      "google",
      resolver,
    );
    expect(response.headers.get("location")).toBe(`${SUCCESS_URL}?error=invalid_oauth_state`);
  });

  it("returns invalid_oauth_token when provider.exchangeCode throws", async () => {
    const env = createEnv();
    await env.kvStore.asKV().put(
      "oauth:state:abc",
      JSON.stringify({ provider: "google", redirect: "/", created_at: 1 }),
    );
    const provider = fakeGoogle({ exchangeError: new Error("network") });
    const response = await handleOAuthCallback(
      new Request("https://api.example.com/auth/oidc/google/callback?code=c&state=abc"),
      env,
      "google",
      fakeResolver(provider),
    );
    expect(response.headers.get("location")).toBe(`${SUCCESS_URL}?error=invalid_oauth_token`);
  });

  it("returns email_unverified when provider says email_verified=false", async () => {
    const env = createEnv();
    await env.kvStore.asKV().put(
      "oauth:state:abc",
      JSON.stringify({ provider: "google", redirect: "/", created_at: 1 }),
    );
    const provider = fakeGoogle({
      exchangeResult: {
        providerSubject: "gid-1",
        email: "player@example.com",
        emailVerified: false,
      },
    });
    const response = await handleOAuthCallback(
      new Request("https://api.example.com/auth/oidc/google/callback?code=c&state=abc"),
      env,
      "google",
      fakeResolver(provider),
    );
    expect(response.headers.get("location")).toBe(`${SUCCESS_URL}?error=email_unverified`);
    expect(env.usersStore.list()).toHaveLength(0);
  });

  it("on success creates user, writes session, and 302s to redirect with fragment", async () => {
    const env = createEnv();
    await env.kvStore.asKV().put(
      "oauth:state:abc",
      JSON.stringify({ provider: "google", redirect: "/dashboard", created_at: 1 }),
    );
    const provider = fakeGoogle({
      exchangeResult: {
        providerSubject: "gid-1",
        email: "Player@Example.com",
        emailVerified: true,
        displayName: "Player",
      },
    });

    const response = await handleOAuthCallback(
      new Request("https://api.example.com/auth/oidc/google/callback?code=c&state=abc"),
      env,
      "google",
      fakeResolver(provider),
    );

    expect(response.status).toBe(302);
    const location = response.headers.get("location")!;
    const target = new URL(location);
    expect(target.origin).toBe(new URL(SUCCESS_URL).origin);
    expect(target.pathname).toBe("/dashboard");
    expect(target.hash).toContain("token=");
    expect(target.hash).toContain("expires_at=");
    expect(target.hash).toContain(`email=${encodeURIComponent("player@example.com")}`);

    expect(env.usersStore.getByEmail("player@example.com")).toMatchObject({
      email: "player@example.com",
      email_verified: 1,
      display_name: "Player",
    });
    expect(env.identitiesStore.list()).toHaveLength(1);
    expect(env.sessionsStore.list()).toHaveLength(1);
  });

  it("links same user across providers when emails match", async () => {
    const env = createEnv();
    // First login: Google
    await env.kvStore.asKV().put(
      "oauth:state:g1",
      JSON.stringify({ provider: "google", redirect: "/", created_at: 1 }),
    );
    await handleOAuthCallback(
      new Request("https://api.example.com/auth/oidc/google/callback?code=c&state=g1"),
      env,
      "google",
      fakeResolver(
        fakeGoogle({
          exchangeResult: {
            providerSubject: "gid-1",
            email: "player@example.com",
            emailVerified: true,
          },
        }),
      ),
    );

    const userIdBefore = env.usersStore.getByEmail("player@example.com")?.id;
    expect(userIdBefore).toBeTruthy();

    // Second login: simulate a different provider with same email (use a "fake" provider id)
    await env.kvStore.asKV().put(
      "oauth:state:g2",
      JSON.stringify({ provider: "google", redirect: "/", created_at: 1 }),
    );
    await handleOAuthCallback(
      new Request("https://api.example.com/auth/oidc/google/callback?code=c&state=g2"),
      env,
      "google",
      fakeResolver(
        fakeGoogle({
          exchangeResult: {
            providerSubject: "gid-1", // same Google subject reused
            email: "player@example.com",
            emailVerified: true,
          },
        }),
      ),
    );

    expect(env.usersStore.list()).toHaveLength(1);
    expect(env.usersStore.getByEmail("player@example.com")?.id).toBe(userIdBefore);
  });
});

describe("apple provider (v1 placeholder)", () => {
  it("returns 400 provider_not_configured on start", async () => {
    const env = createEnv();
    const response = await handleOAuthStart(
      new Request("https://api.example.com/auth/oidc/apple/start"),
      env,
      "apple",
      getOAuthProvider,
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("provider_not_configured");
  });

  it("returns 302 to error=provider_not_configured on callback", async () => {
    const env = createEnv();
    const response = await handleOAuthCallback(
      new Request("https://api.example.com/auth/oidc/apple/callback?code=c&state=s"),
      env,
      "apple",
      getOAuthProvider,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${SUCCESS_URL}?error=provider_not_configured`);
  });
});

describe("getOAuthProvider", () => {
  it("returns google provider when credentials are set", async () => {
    const env = createEnv({
      GOOGLE_OAUTH_CLIENT_ID: "cid",
      GOOGLE_OAUTH_CLIENT_SECRET: "secret",
    });
    const provider = await getOAuthProvider(env, "google");
    expect(provider.id).toBe("google");
  });

  it("throws provider_not_configured for google when credentials missing", async () => {
    const env = createEnv();
    await expect(getOAuthProvider(env, "google")).rejects.toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

  it("throws unknown_provider for an unrecognised provider id", async () => {
    const env = createEnv();
    await expect(getOAuthProvider(env, "github")).rejects.toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });
});

// -----------------------------------------------------------------------------

type FakeGoogleOptions = {
  exchangeResult?: OAuthExchangeResult;
  exchangeError?: Error;
};

function fakeGoogle(options: FakeGoogleOptions = {}): OAuthProvider {
  return {
    id: "google",
    buildAuthorizationUrl({ state }) {
      const url = new URL("https://accounts.fake/authorize");
      url.searchParams.set("state", state);
      return url;
    },
    async exchangeCode() {
      if (options.exchangeError) throw options.exchangeError;
      return (
        options.exchangeResult ?? {
          providerSubject: "default-subject",
          email: "player@example.com",
          emailVerified: true,
        }
      );
    },
  };
}

function fakeResolver(provider: OAuthProvider): ProviderResolver {
  return () => provider;
}

function createEnv(
  overrides: Record<string, unknown> = {},
): AuthEnv & {
  usersStore: UsersStore;
  identitiesStore: IdentitiesStore;
  sessionsStore: SessionsStore;
  kvStore: KvStore;
} {
  const usersStore = createUsersStore();
  const identitiesStore = createIdentitiesStore();
  const sessionsStore = createSessionsStore();
  const kvStore = createKvStore();

  // Stable state UUID so tests can assert on the KV key.
  let nextUuid = "test-state";
  vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
    const value = nextUuid as `${string}-${string}-${string}-${string}-${string}`;
    nextUuid = crypto.getRandomValues(new Uint8Array(16)).join("-");
    return value;
  });

  const base = {
    APP_ENV: "dev" as const,
    AUTH_SUCCESS_URL: SUCCESS_URL,
    ALLOWED_ORIGINS: `${new URL(SUCCESS_URL).origin},https://dev.aiappsbox.com`,
    AUTH_TOKEN_SECRET: "test-auth-secret",
    CONFIG: kvStore.asKV(),
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
                const sessionResult = sessionsStore.handle(sql, values);
                if (sessionResult?.kind === "first") return sessionResult.result;
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
                const sessionResult = sessionsStore.handle(sql, values);
                if (sessionResult?.kind === "run") return sessionResult.result;
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  } as unknown as AuthEnv;

  return Object.assign(base, overrides, {
    usersStore,
    identitiesStore,
    sessionsStore,
    kvStore,
  }) as AuthEnv & {
    usersStore: UsersStore;
    identitiesStore: IdentitiesStore;
    sessionsStore: SessionsStore;
    kvStore: KvStore;
  };
}
