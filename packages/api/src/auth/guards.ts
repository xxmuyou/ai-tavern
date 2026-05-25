import { ensureUserByEmail, normalizeEmail, type UserRecord } from "../identity";
import { verifyRequestAuth } from "./session";
import { DEFAULT_ADMIN_EMAILS, authError, isDevRuntime } from "./types";
import type { AuthEnv } from "./types";

export async function requireAuthEmail(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<string> {
  const payload = await verifyRequestAuth(env as AuthEnv, request);
  if (payload) {
    return payload.email;
  }

  if (isDevRuntime(env)) {
    const email = normalizeEmail(fallbackEmail);
    if (email) {
      return email;
    }
  }

  throw authError("auth_required", 401);
}

export async function optionalAuthEmail(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<string | undefined> {
  const payload = await verifyRequestAuth(env as AuthEnv, request);
  if (payload) {
    return payload.email;
  }

  if (isDevRuntime(env)) {
    return normalizeEmail(fallbackEmail);
  }

  return undefined;
}

export async function requireAuthUser(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<UserRecord> {
  return ensureUserByEmail(env, await requireAuthEmail(env, request, fallbackEmail));
}

export async function optionalAuthUser(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<UserRecord | null> {
  const email = await optionalAuthEmail(env, request, fallbackEmail);
  return email ? ensureUserByEmail(env, email) : null;
}

export async function requireAdminUser(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<UserRecord> {
  const user = await requireAuthUser(env, request, fallbackEmail);
  if (!isAdminEmail(env, user.email)) {
    throw authError("admin_required", 403);
  }

  return user;
}

export async function requireAdminEmail(
  env: Env,
  request: Request,
  fallbackEmail?: string | null,
): Promise<string> {
  return (await requireAdminUser(env, request, fallbackEmail)).email;
}

export function isAdminEmail(env: Env, email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  return Boolean(normalized && getConfiguredAdminEmails(env).has(normalized));
}

export function getConfiguredAdminEmails(env: Env): Set<string> {
  const authEnv = env as AuthEnv;
  const configured = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter((email): email is string => Boolean(email));
  const emails = configured.length ? configured : DEFAULT_ADMIN_EMAILS;
  return new Set(emails);
}
