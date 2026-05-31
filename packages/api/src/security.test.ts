import { describe, expect, it } from "vitest";

import { enforceRateLimit, isRequestBodyTooLarge, resolveAllowedCorsOrigin, withCors } from "./security";

describe("api security helpers", () => {
  it("allows only configured CORS origins", async () => {
    const env = { ALLOWED_ORIGINS: "https://app.example.com,http://localhost:8081" } as unknown as Env;

    expect(await resolveAllowedCorsOrigin(new Request("https://api.example.com", {
      headers: { origin: "https://app.example.com" },
    }), env)).toBe("https://app.example.com");
    expect(await resolveAllowedCorsOrigin(new Request("https://api.example.com", {
      headers: { origin: "https://evil.example.com" },
    }), env)).toBeNull();
  });

  it("allows browser DELETE preflight for mutation endpoints", async () => {
    const env = { ALLOWED_ORIGINS: "http://localhost:8081" } as unknown as Env;
    const request = new Request("https://api.example.com/chat/ryan/history", {
      headers: { origin: "http://localhost:8081" },
      method: "OPTIONS",
    });

    const response = await withCors(request, env, new Response(null, { status: 204 }));

    expect(response.headers.get("access-control-allow-methods")).toContain("DELETE");
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:8081");
  });

  it("checks mutation request body size from content-length", async () => {
    const env = { REQUEST_BODY_LIMIT_BYTES: "10" } as unknown as Env;

    expect(await isRequestBodyTooLarge(new Request("https://api.example.com/jobs", {
      headers: { "content-length": "11" },
      method: "POST",
    }), env, "/jobs")).toBe(true);
    expect(await isRequestBodyTooLarge(new Request("https://api.example.com/health", {
      headers: { "content-length": "9999" },
      method: "GET",
    }), env, "/health")).toBe(false);
  });

  it("uses the Stripe webhook body limit on /billing/webhook", async () => {
    const env = {
      REQUEST_BODY_LIMIT_BYTES: "10",
      STRIPE_WEBHOOK_BODY_LIMIT_BYTES: "100",
    } as unknown as Env;

    const request = new Request("https://api.example.com/billing/webhook", {
      headers: { "content-length": "50" },
      method: "POST",
    });

    expect(await isRequestBodyTooLarge(request, env, "/billing/webhook")).toBe(false);
  });

  it("rate limits repeated mutations in the same minute", async () => {
    const env = createRateLimitEnv();
    const request = new Request("https://api.example.com/shows/dating-heart-signal/workspace/guests", {
      method: "POST",
    });

    expect(await enforceRateLimit(env, request, "/shows/dating-heart-signal/workspace/guests")).toBeNull();
    const blocked = await enforceRateLimit(env, request, "/shows/dating-heart-signal/workspace/guests");

    expect(blocked?.status).toBe(429);
  });

  it("does not rate limit Stripe webhooks", async () => {
    const env = createRateLimitEnv();
    const request = new Request("https://api.example.com/billing/webhook", { method: "POST" });

    expect(await enforceRateLimit(env, request, "/billing/webhook")).toBeNull();
    expect(await enforceRateLimit(env, request, "/billing/webhook")).toBeNull();
  });
});

function createRateLimitEnv(): Env {
  const values = new Map<string, string>();
  return {
    APP_ENV: "dev",
    CONFIG: {
      async get(key: string) {
        return values.get(key) ?? null;
      },
      async put(key: string, value: string) {
        values.set(key, value);
      },
    },
    RATE_LIMIT_PER_MINUTE: "1",
  } as unknown as Env;
}
