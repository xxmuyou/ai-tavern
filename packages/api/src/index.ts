import { API_VERSION, type HealthResponse } from "@xtbit/shared";

import { handleAuthRequest, requireAdminUser } from "./auth";
import { jsonResponse, notFound, readJson } from "./http";
import { enforceRateLimit, isRequestBodyTooLarge, jsonCorsResponse, withCors } from "./security";
export { GameRoom } from "./room";

type UploadMetadata = {
  contentType?: string;
  sizeBytes?: number;
};

// Endpoints removed by spec-003 (D1 schema reset).
// Each prefix is reintroduced by a later spec on top of the v1 schema:
//   /billing/*          -> spec-010 (Stripe + quota)
//   /companions/*       -> spec-004 / spec-005 (companions + relationships)
//   /scenes/*           -> spec-007 (scenes module)
//   /chat/*             -> spec-006 (chat rewrite)
//   /events/*           -> spec-008 (events module)
//   /show/*             -> deprecated entirely (chapter-based gameplay retired)
//   /companion/*        -> deprecated entirely (replaced by /companions and /chat)
//   /admin/llm/*        -> spec-002 / spec-011 (LLM router + admin console)
const RETIRED_PREFIXES: ReadonlyArray<string> = [
  "/billing/",
  "/companions/",
  "/scenes/",
  "/chat/",
  "/events/",
  "/show/",
  "/companion/",
  "/admin/llm/",
];

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const pathname = normalizeApiPath(url.pathname);

    try {
      if (request.method === "OPTIONS") {
        return jsonCorsResponse(request, env, null);
      }

      if (isRequestBodyTooLarge(request, env, pathname)) {
        return jsonCorsResponse(request, env, { error: "request_body_too_large" }, { status: 413 });
      }

      const rateLimitResponse = await enforceRateLimit(env, request, pathname);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      const authResponse = await handleAuthRequest(request, env, pathname);
      if (authResponse) {
        return withCors(request, env, authResponse);
      }

      if (isRetiredPath(pathname)) {
        return jsonCorsResponse(
          request,
          env,
          { error: "endpoint_retired", message: "This endpoint was removed by the v1 redesign and will be reintroduced by a later spec." },
          { status: 410 },
        );
      }

      if (pathname === "/health" && request.method === "GET") {
        const body: HealthResponse = {
          ok: true,
          service: "xtbit-apps-api",
          version: API_VERSION,
          environment: env.APP_ENV,
        };

        return jsonCorsResponse(request, env, body);
      }

      if (pathname === "/config/bootstrap" && request.method === "GET") {
        const config = await env.CONFIG.get("client:bootstrap", "json");
        return jsonCorsResponse(request, env, { config: config ?? {} });
      }

      if (pathname === "/db/ping" && request.method === "GET") {
        const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        return jsonCorsResponse(request, env, { ok: result?.ok === 1 });
      }

      if (pathname === "/jobs" && request.method === "POST") {
        const body = await readJson<Record<string, unknown>>(request);
        await env.JOB_QUEUE.send({
          id: crypto.randomUUID(),
          type: "manual",
          body,
          createdAt: new Date().toISOString(),
        });
        return jsonCorsResponse(request, env, { ok: true }, { status: 202 });
      }

      const objectMatch = pathname.match(/^\/objects\/(.+)$/);
      if (objectMatch) {
        const objectKey = objectMatch[1];
        if (!objectKey) {
          return jsonCorsResponse(request, env, { error: "invalid_object_key" }, { status: 400 });
        }

        return handleObjectRequest(request, env, ctx, decodeURIComponent(objectKey));
      }

      const roomMatch = pathname.match(/^\/rooms\/([^/]+)(?:\/events)?$/);
      if (roomMatch) {
        const matchedRoomId = roomMatch[1];
        if (!matchedRoomId) {
          return jsonCorsResponse(request, env, { error: "invalid_room_id" }, { status: 400 });
        }

        const roomId = decodeURIComponent(matchedRoomId);
        const id = env.ROOMS.idFromName(roomId);
        const room = env.ROOMS.get(id);
        const roomUrl = new URL(request.url);
        roomUrl.pathname = pathname;
        return room.fetch(new Request(roomUrl, request));
      }

      return jsonCorsResponse(request, env, { error: "not_found" }, { status: 404 });
    } catch (error) {
      if (error instanceof Response) {
        return withCors(request, env, error);
      }

      console.error(JSON.stringify({ message: "Unhandled API error", error: String(error) }));
      return jsonCorsResponse(request, env, { error: "internal_error" }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

function normalizeApiPath(pathname: string): string {
  if (pathname === "/api") {
    return "/";
  }

  if (pathname.startsWith("/api/")) {
    return pathname.slice("/api".length);
  }

  return pathname;
}

function isRetiredPath(pathname: string): boolean {
  return RETIRED_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

async function handleObjectRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  key: string,
): Promise<Response> {
  const normalizedKey = normalizeObjectKey(key);
  if (!normalizedKey) {
    return jsonCorsResponse(request, env, { error: "invalid_object_key" }, { status: 400 });
  }

  if (request.method === "PUT") {
    await requireAdminUser(env, request);

    if (!request.body) {
      return jsonCorsResponse(request, env, { error: "missing_body" }, { status: 400 });
    }

    const contentType = request.headers.get("content-type") ?? "application/octet-stream";
    const sizeBytes = Number(request.headers.get("content-length") ?? "0") || undefined;
    const metadata: UploadMetadata = { contentType, sizeBytes };

    await env.ASSETS.put(normalizedKey, request.body, {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        source: "worker",
      },
    });

    ctx.waitUntil(recordAsset(env, normalizedKey, metadata));

    return jsonCorsResponse(request, env, { key: normalizedKey }, { status: 201 });
  }

  if (request.method === "GET") {
    const object = await env.ASSETS.get(normalizedKey);
    if (!object) {
      return withCors(request, env, notFound());
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);

    return withCors(request, env, new Response(object.body, { headers }));
  }

  return jsonCorsResponse(request, env, { error: "method_not_allowed" }, { status: 405 });
}

async function recordAsset(env: Env, key: string, metadata: UploadMetadata): Promise<void> {
  await env.DB.prepare(
    "INSERT OR REPLACE INTO asset_objects (key, content_type, size_bytes) VALUES (?, ?, ?)",
  )
    .bind(key, metadata.contentType ?? null, metadata.sizeBytes ?? null)
    .run();

  await env.JOB_QUEUE.send({
    id: crypto.randomUUID(),
    type: "asset.uploaded",
    key,
    createdAt: new Date().toISOString(),
  });
}

function normalizeObjectKey(key: string): string | null {
  const trimmed = key.trim().replace(/^\/+/, "");

  if (!trimmed || trimmed.includes("..") || trimmed.length > 512) {
    return null;
  }

  return trimmed;
}
