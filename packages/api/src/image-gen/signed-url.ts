import { getSetting } from "../settings/store";

const DEFAULT_TTL_SECONDS = 15 * 60;

export type SignedObject = {
  key: string;
  exp: number;
};

export async function createSignedObjectUrl(
  env: Env,
  sourceArtUrl: string,
  options: { ttlSeconds?: number } = {},
): Promise<string> {
  const key = normalizeObjectKey(sourceArtUrl);
  if (!key) {
    throw new Error("invalid_source_art_url");
  }

  const signingKey = await readSigningKey(env);
  const exp = Math.floor(Date.now() / 1000) + (options.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const sig = await signObjectToken(signingKey, key, exp);
  const baseUrl = await readPublicBaseUrl(env);
  const encodedKey = encodeURIComponent(key);

  return `${baseUrl}/objects/signed/${encodedKey}?exp=${exp}&sig=${sig}`;
}

export async function verifySignedObjectRequest(
  env: Env,
  request: Request,
  key: string,
): Promise<SignedObject | null> {
  if (request.method !== "GET") return null;

  const url = new URL(request.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000) || !sig) {
    return null;
  }

  const signingKey = await readSigningKey(env);
  const expected = await signObjectToken(signingKey, key, exp);
  if (!constantTimeEqual(sig, expected)) {
    return null;
  }

  return { exp, key };
}

export function normalizeObjectKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let key = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      key = new URL(trimmed).pathname.replace(/^\/+/, "");
      if (key.startsWith("api/objects/")) key = key.slice("api/objects/".length);
      else if (key.startsWith("objects/")) key = key.slice("objects/".length);
    } catch {
      return null;
    }
  }

  const normalized = decodeURIComponent(key).replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.length > 512) {
    return null;
  }
  return normalized;
}

async function readSigningKey(env: Env): Promise<string> {
  const value = await getSetting(env, "image_gen.r2_signing_key");
  if (!value) {
    throw new Error("R2_SIGNING_KEY is required for signed image URLs");
  }
  return value;
}

async function readPublicBaseUrl(env: Env): Promise<string> {
  const explicit = await getSetting(env, "image_gen.public_base_url");
  if (explicit) return explicit.replace(/\/+$/, "");

  const webhook = await getSetting(env, "image_gen.webhook_url");
  if (webhook) {
    const url = new URL(webhook);
    const apiPrefix = url.pathname.startsWith("/api/") ? "/api" : "";
    return `${url.origin}${apiPrefix}`;
  }

  throw new Error("IMAGE_GEN_PUBLIC_BASE_URL or RUNNINGHUB_WEBHOOK_URL is required");
}

async function signObjectToken(secret: string, key: string, exp: number): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(`${key}.${exp}`),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
