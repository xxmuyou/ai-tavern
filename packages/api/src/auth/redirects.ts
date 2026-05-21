import { authError } from "./types";
import type { AuthEnv } from "./types";

export type SuccessFragment = {
  token: string;
  expiresIso: string;
  email: string;
};

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function readAuthSuccessUrl(env: AuthEnv): URL {
  const value = env.AUTH_SUCCESS_URL?.trim();
  if (!value) {
    throw authError("auth_success_url_invalid", 500);
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw authError("auth_success_url_invalid", 500);
    }
    return url;
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    throw authError("auth_success_url_invalid", 500);
  }
}

export function readAllowedOrigins(env: AuthEnv): Set<string> {
  const list = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(list);
}

export function normalizeRedirect(env: AuthEnv, raw: string | null | undefined): string {
  const successFallback = readAuthSuccessUrl(env).toString();
  if (typeof raw !== "string") {
    return successFallback;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return successFallback;
  }

  if (/[\r\n]/.test(trimmed)) {
    return successFallback;
  }

  if (trimmed.startsWith("//")) {
    return successFallback;
  }

  if (HAS_SCHEME.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return successFallback;
      }
      const allowed = readAllowedOrigins(env);
      if (allowed.has(parsed.origin)) {
        return parsed.toString();
      }
    } catch {
      return successFallback;
    }
    return successFallback;
  }

  if (!trimmed.startsWith("/")) {
    return successFallback;
  }

  return trimmed;
}

export function buildSuccessTarget(
  env: AuthEnv,
  redirect: string,
  fragment: SuccessFragment,
): URL {
  const successUrl = readAuthSuccessUrl(env);
  const target = new URL(redirect, successUrl);
  target.hash = buildFragment(fragment);
  return target;
}

export function buildErrorTarget(env: AuthEnv, errorCode: string): URL {
  const successUrl = readAuthSuccessUrl(env);
  successUrl.searchParams.set("error", errorCode);
  return successUrl;
}

export function redirectResponse(target: URL): Response {
  return new Response(null, {
    status: 302,
    headers: { location: target.toString() },
  });
}

function buildFragment(fragment: SuccessFragment): string {
  const params = new URLSearchParams();
  params.set("token", fragment.token);
  params.set("expires_at", fragment.expiresIso);
  params.set("email", fragment.email);
  return params.toString();
}
