import { authError } from "./types";
import type { AuthEnv } from "./types";
import { getSetting } from "../settings/store";

export type SuccessFragment = {
  token: string;
  expiresIso: string;
  email: string;
};

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export async function readAuthSuccessUrl(env: AuthEnv): Promise<URL> {
  const value = await getSetting(env, "auth.success_url");
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

export async function readAllowedOrigins(env: AuthEnv): Promise<Set<string>> {
  const raw = await getSetting(env, "auth.allowed_origins");
  const list = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(list);
}

export async function normalizeRedirect(env: AuthEnv, raw: string | null | undefined): Promise<string> {
  const successFallback = (await readAuthSuccessUrl(env)).toString();
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
      const allowed = await readAllowedOrigins(env);
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

export async function buildSuccessTarget(
  env: AuthEnv,
  redirect: string,
  fragment: SuccessFragment,
): Promise<URL> {
  const successUrl = await readAuthSuccessUrl(env);
  const target = new URL(redirect, successUrl);
  target.hash = buildFragment(fragment);
  return target;
}

export async function buildErrorTarget(env: AuthEnv, errorCode: string): Promise<URL> {
  const successUrl = await readAuthSuccessUrl(env);
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
