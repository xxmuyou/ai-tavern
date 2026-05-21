import { jsonResponse } from "../http";

export type AuthEnv = Env & {
  ADMIN_EMAILS?: string;
  AUTH_TOKEN_SECRET?: string;
  JWT_SIGNING_KEY?: string;
  DEV_AUTH_TOKEN_TTL_SECONDS?: string;
  AUTH_SUCCESS_URL?: string;
  ALLOWED_ORIGINS?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  EMAIL_PROVIDER_API_KEY?: string;
  EMAIL_FROM_ADDRESS?: string;
  APPLE_SIGNIN_TEAM_ID?: string;
  APPLE_SIGNIN_KEY_ID?: string;
  APPLE_SIGNIN_CLIENT_ID?: string;
  APPLE_SIGNIN_PRIVATE_KEY?: string;
};

export type IdentityProvider = "google" | "apple" | "email";

export type AuthPayload = {
  email: string;
  exp: number;
  iat: number;
  sub: string;
};

export const DEFAULT_DEV_TOKEN_TTL_SECONDS = 60 * 60 * 8;
export const DEV_FALLBACK_SECRET = "xtbit-local-dev-auth-token-secret";
export const DEFAULT_ADMIN_EMAILS = ["admin@aiappsbox.com"];

export function isDevRuntime(env: Pick<Env, "APP_ENV">): boolean {
  return env.APP_ENV !== "prod";
}

export function authError(error: string, status: number): Response {
  return jsonResponse({ error }, { status });
}
