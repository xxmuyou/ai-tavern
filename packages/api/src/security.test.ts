import { describe, expect, it } from "vitest";

import { enforceRateLimit, isRequestBodyTooLarge, resolveAllowedCorsOrigin } from "./security";

describe("api security helpers", () => {
  it("allows only configured CORS origins", () => {
    const env = { ALLOWED_ORIGINS: "https://app.example.com,http://localhost:8081" } as unknown as Env;

    expect(resolveAllowedCorsOrigin(new Request("https://api.example.com", {
      headers: { origin: "https://app.example.com" },
    }), env)).toBe("https://app.example.com");
    expect(resolveAllowedCorsOrigin(new Request("https://api.example.com", {
      headers: { origin: "https://evil.example.com" },
    }), env)).toBeNull();
  });

  it("checks mutation request body size from content-length", () => {
    const env = { REQUEST_BODY_LIMIT_BYTES: "10" } as unknown as Env;

    expect(isRequestBodyTooLarge(new Request("https://api.example.com/jobs", {
      headers: { "content-length": "11" },
      method: "POST",
    }), env, "/jobs")).toBe(true);
    expect(isRequestBodyTooLarge(new Request("https://api.example.com/health", {
      headers: { "content-length": "9999" },
      method: "GET",
    }), env, "/health")).toBe(false);
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
