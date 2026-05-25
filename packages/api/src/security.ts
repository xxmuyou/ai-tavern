import { jsonResponse } from "./http";

type SecurityEnv = Env & {
  ALLOWED_ORIGINS?: string;
  ASSET_UPLOAD_BODY_LIMIT_BYTES?: string;
  LLM_RATE_LIMIT_PER_MINUTE?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  REQUEST_BODY_LIMIT_BYTES?: string;
  STRIPE_WEBHOOK_BODY_LIMIT_BYTES?: string;
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
  "https://aiappsbox.com",
  "https://dev.aiappsbox.com",
];

const DEFAULT_REQUEST_BODY_LIMIT_BYTES = 256 * 1024;
const DEFAULT_ASSET_UPLOAD_BODY_LIMIT_BYTES = 5 * 1024 * 1024;
const DEFAULT_STRIPE_WEBHOOK_BODY_LIMIT_BYTES = 1024 * 1024;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 120;
const DEFAULT_LLM_RATE_LIMIT_PER_MINUTE = 30;

export function jsonCorsResponse(
  request: Request,
  env: Env,
  data: unknown,
  init: ResponseInit = {},
): Response {
  return withCors(request, env, jsonResponse(data, init));
}

export function withCors(request: Request, env: Env, response: Response): Response {
  const headers = new Headers(response.headers);
  const allowedOrigin = resolveAllowedCorsOrigin(request, env as SecurityEnv);
  if (allowedOrigin) {
    headers.set("access-control-allow-origin", allowedOrigin);
    headers.set("access-control-allow-credentials", "true");
  }

  headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization,stripe-signature");
  headers.append("vary", "origin");

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function resolveAllowedCorsOrigin(request: Request, env: SecurityEnv): string | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  return readAllowedOrigins(env).has(origin) ? origin : null;
}

export function isRequestBodyTooLarge(request: Request, env: Env, pathname: string): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return false;
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return false;
  }

  const securityEnv = env as SecurityEnv;
  const limit = pathname === "/billing/webhook"
    ? readPositiveInt(securityEnv.STRIPE_WEBHOOK_BODY_LIMIT_BYTES, DEFAULT_STRIPE_WEBHOOK_BODY_LIMIT_BYTES)
    : isAssetUploadRequest(request, pathname)
      ? readPositiveInt(securityEnv.ASSET_UPLOAD_BODY_LIMIT_BYTES, DEFAULT_ASSET_UPLOAD_BODY_LIMIT_BYTES)
      : readPositiveInt(securityEnv.REQUEST_BODY_LIMIT_BYTES, DEFAULT_REQUEST_BODY_LIMIT_BYTES);

  return contentLength > limit;
}

export async function enforceRateLimit(env: Env, request: Request, pathname: string): Promise<Response | null> {
  if (!shouldRateLimit(request, pathname)) {
    return null;
  }

  const securityEnv = env as SecurityEnv;
  const limit = pathname.startsWith("/llm")
    ? readPositiveInt(securityEnv.LLM_RATE_LIMIT_PER_MINUTE, DEFAULT_LLM_RATE_LIMIT_PER_MINUTE)
    : readPositiveInt(securityEnv.RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT_PER_MINUTE);
  const minute = Math.floor(Date.now() / 60000);
  const subject = rateLimitSubject(request);
  const bucket = pathname.startsWith("/llm") ? "llm" : "mutate";
  const key = `rate:${bucket}:${minute}:${subject}`;
  const current = Number((await env.CONFIG.get(key)) ?? "0");

  if (Number.isFinite(current) && current >= limit) {
    return jsonCorsResponse(request, env, { error: "rate_limited" }, {
      headers: {
        "retry-after": "60",
      },
      status: 429,
    });
  }

  await env.CONFIG.put(key, String((Number.isFinite(current) ? current : 0) + 1), { expirationTtl: 90 });
  return null;
}

function readAllowedOrigins(env: SecurityEnv): Set<string> {
  const configured = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function shouldRateLimit(request: Request, pathname: string): boolean {
  if (request.method === "OPTIONS") {
    return false;
  }

  if (pathname === "/billing/webhook") {
    return false;
  }

  return request.method !== "GET" || pathname.startsWith("/llm");
}

function isAssetUploadRequest(request: Request, pathname: string): boolean {
  const method = request.method.toUpperCase();
  return (method === "PUT" && pathname.startsWith("/objects/")) ||
    (method === "POST" && /^\/shows\/[^/]+\/admin\/system-assets\//.test(pathname));
}

function rateLimitSubject(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization) {
    return `auth:${hashish(authorization)}`;
  }

  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "anonymous";
}

function hashish(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
