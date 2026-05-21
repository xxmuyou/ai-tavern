import { describe, expect, it } from "vitest";

import {
  buildErrorTarget,
  buildSuccessTarget,
  normalizeRedirect,
  readAuthSuccessUrl,
  redirectResponse,
} from "./redirects";
import type { AuthEnv } from "./types";

const SUCCESS_URL = "https://dev.xtbit-apps.pages.dev/auth/success";
const ALLOWED_ORIGINS = `${new URL(SUCCESS_URL).origin},https://dev.aiappsbox.com,http://localhost:8081`;

function env(overrides: Record<string, unknown> = {}): AuthEnv {
  return {
    APP_ENV: "dev",
    AUTH_SUCCESS_URL: SUCCESS_URL,
    ALLOWED_ORIGINS,
    ...overrides,
  } as unknown as AuthEnv;
}

describe("readAuthSuccessUrl", () => {
  it("returns parsed URL when configured", () => {
    expect(readAuthSuccessUrl(env()).toString()).toBe(SUCCESS_URL);
  });

  it("throws 500 when missing", () => {
    expect(() => readAuthSuccessUrl(env({ AUTH_SUCCESS_URL: undefined }))).toThrow(
      expect.objectContaining({ status: 500 }),
    );
  });

  it("throws 500 when not absolute", () => {
    expect(() => readAuthSuccessUrl(env({ AUTH_SUCCESS_URL: "/auth/success" }))).toThrow(
      expect.objectContaining({ status: 500 }),
    );
  });

  it("throws 500 when non-http(s) protocol", () => {
    expect(() => readAuthSuccessUrl(env({ AUTH_SUCCESS_URL: "ftp://example.com/" }))).toThrow(
      expect.objectContaining({ status: 500 }),
    );
  });
});

describe("normalizeRedirect", () => {
  it("accepts a relative path", () => {
    expect(normalizeRedirect(env(), "/auth/success?next=/scenes")).toBe("/auth/success?next=/scenes");
  });

  it("accepts an absolute URL whose origin is allowed", () => {
    expect(normalizeRedirect(env(), "https://dev.aiappsbox.com/path")).toBe(
      "https://dev.aiappsbox.com/path",
    );
  });

  it("rejects an absolute URL whose origin is not allowed", () => {
    expect(normalizeRedirect(env(), "https://evil.example.com/foo")).toBe(SUCCESS_URL);
  });

  it("rejects protocol-relative // urls", () => {
    expect(normalizeRedirect(env(), "//evil.example.com/foo")).toBe(SUCCESS_URL);
  });

  it("rejects strings containing CR or LF (header injection)", () => {
    expect(normalizeRedirect(env(), "/auth/success\r\nLocation: https://evil")).toBe(SUCCESS_URL);
    expect(normalizeRedirect(env(), "/auth/success\nfoo")).toBe(SUCCESS_URL);
  });

  it("falls back when input is empty or undefined", () => {
    expect(normalizeRedirect(env(), undefined)).toBe(SUCCESS_URL);
    expect(normalizeRedirect(env(), null)).toBe(SUCCESS_URL);
    expect(normalizeRedirect(env(), "")).toBe(SUCCESS_URL);
    expect(normalizeRedirect(env(), "   ")).toBe(SUCCESS_URL);
  });

  it("rejects relative paths that don't start with /", () => {
    expect(normalizeRedirect(env(), "auth/success")).toBe(SUCCESS_URL);
  });

  it("rejects non-http(s) schemes", () => {
    expect(normalizeRedirect(env(), "javascript:alert(1)")).toBe(SUCCESS_URL);
    expect(normalizeRedirect(env(), "file:///etc/passwd")).toBe(SUCCESS_URL);
  });
});

describe("buildSuccessTarget", () => {
  it("expands relative path using AUTH_SUCCESS_URL origin", () => {
    const target = buildSuccessTarget(env(), "/auth/success", {
      token: "jwt-token",
      expiresIso: "2026-06-20T00:00:00.000Z",
      email: "player@example.com",
    });
    expect(target.origin).toBe(new URL(SUCCESS_URL).origin);
    expect(target.pathname).toBe("/auth/success");
    expect(target.hash).toContain("token=jwt-token");
    expect(target.hash).toContain(`expires_at=${encodeURIComponent("2026-06-20T00:00:00.000Z")}`);
    expect(target.hash).toContain(`email=${encodeURIComponent("player@example.com")}`);
  });

  it("preserves origin when redirect is already absolute and allowed", () => {
    const target = buildSuccessTarget(env(), "https://dev.aiappsbox.com/landing", {
      token: "t",
      expiresIso: "2026-01-01T00:00:00Z",
      email: "a@b.com",
    });
    expect(target.origin).toBe("https://dev.aiappsbox.com");
    expect(target.pathname).toBe("/landing");
  });

  it("url-encodes special characters in email and expiry", () => {
    const target = buildSuccessTarget(env(), "/auth/success", {
      token: "t",
      expiresIso: "2026-06-20T00:00:00.000Z",
      email: "a+b@x.com",
    });
    expect(target.hash).toContain(`email=${encodeURIComponent("a+b@x.com")}`);
  });
});

describe("buildErrorTarget", () => {
  it("appends ?error=<code> to AUTH_SUCCESS_URL", () => {
    const target = buildErrorTarget(env(), "invalid_oauth_state");
    expect(target.toString()).toBe(`${SUCCESS_URL}?error=invalid_oauth_state`);
  });
});

describe("redirectResponse", () => {
  it("returns 302 with Location header", () => {
    const url = new URL("https://example.com/x");
    const response = redirectResponse(url);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/x");
  });
});
