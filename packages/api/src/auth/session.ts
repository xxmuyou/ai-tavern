import { normalizeEmail } from "../identity";
import { DEV_FALLBACK_SECRET, authError, isDevRuntime } from "./types";
import type { AuthEnv, AuthPayload } from "./types";

export async function signAuthToken(env: AuthEnv, payload: AuthPayload): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const signature = await hmacSha256(env, data);

  return `${data}.${signature}`;
}

export async function verifyAuthToken(env: AuthEnv, token: string): Promise<AuthPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw authError("invalid_token", 401);
  }

  const [header, body, signature] = parts as [string, string, string];
  const key = await importHmacKey(readAuthSecret(env));
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(signature),
    new TextEncoder().encode(`${header}.${body}`),
  );
  if (!valid) {
    throw authError("invalid_token", 401);
  }

  const payload = parsePayload(body);
  if (!payload) {
    throw authError("invalid_token", 401);
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    throw authError("token_expired", 401);
  }

  return payload;
}

export async function verifyRequestAuth(env: AuthEnv, request: Request): Promise<AuthPayload | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    return null;
  }

  return verifyAuthToken(env, token);
}

async function hmacSha256(env: AuthEnv, data: string): Promise<string> {
  const key = await importHmacKey(readAuthSecret(env));
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"],
  );
}

function readAuthSecret(env: AuthEnv): string {
  const configured = env.AUTH_TOKEN_SECRET?.trim();
  if (configured) {
    return configured;
  }

  if (isDevRuntime(env)) {
    return DEV_FALLBACK_SECRET;
  }

  throw authError("auth_secret_missing", 500);
}

function parsePayload(value: string): AuthPayload | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as Partial<AuthPayload>;
    const email = normalizeEmail(parsed.email);
    if (!email || typeof parsed.sub !== "string" || typeof parsed.exp !== "number" || typeof parsed.iat !== "number") {
      return null;
    }

    return {
      email,
      exp: parsed.exp,
      iat: parsed.iat,
      sub: parsed.sub,
    };
  } catch {
    return null;
  }
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
