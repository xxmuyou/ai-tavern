import { API_VERSION, type HealthResponse } from "@xtbit/shared";

import { handleAiTvDatingRequest } from "./ai-tv-dating";
import { handleAppsRequest } from "./apps";
import { handleBillingRequest } from "./billing";
import { jsonResponse, notFound, readJson } from "./http";
import { handleLlmAdminRequest } from "./llm/admin";
import { handleShowRequest } from "./show-engine";
export { GameRoom } from "./room";

type UploadMetadata = {
  contentType?: string;
  sizeBytes?: number;
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const pathname = normalizeApiPath(url.pathname);

    try {
      if (request.method === "OPTIONS") {
        return corsResponse(null);
      }

      const billingResponse = await handleBillingRequest(request, env, pathname);
      if (billingResponse) {
        return withCors(billingResponse);
      }

      const datingResponse = await handleAiTvDatingRequest(request, env, pathname);
      if (datingResponse) {
        return withCors(datingResponse);
      }

      const showResponse = await handleShowRequest(request, env, pathname);
      if (showResponse) {
        return withCors(showResponse);
      }

      const llmAdminResponse = await handleLlmAdminRequest(request, env, pathname);
      if (llmAdminResponse) {
        return withCors(llmAdminResponse);
      }

      const appsResponse = await handleAppsRequest(request, env, pathname);
      if (appsResponse) {
        return withCors(appsResponse);
      }

      if (pathname === "/health" && request.method === "GET") {
        const body: HealthResponse = {
          ok: true,
          service: "xtbit-apps-api",
          version: API_VERSION,
          environment: env.APP_ENV,
        };

        return corsResponse(body);
      }

      if (pathname === "/config/bootstrap" && request.method === "GET") {
        const config = await env.CONFIG.get("client:bootstrap", "json");
        return corsResponse({ config: config ?? {} });
      }

      if (pathname === "/db/ping" && request.method === "GET") {
        const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        return corsResponse({ ok: result?.ok === 1 });
      }

      if (pathname === "/jobs" && request.method === "POST") {
        const body = await readJson<Record<string, unknown>>(request);
        await env.JOB_QUEUE.send({
          id: crypto.randomUUID(),
          type: "manual",
          body,
          createdAt: new Date().toISOString(),
        });
        return corsResponse({ ok: true }, { status: 202 });
      }

      const objectMatch = pathname.match(/^\/objects\/(.+)$/);
      if (objectMatch) {
        const objectKey = objectMatch[1];
        if (!objectKey) {
          return corsResponse({ error: "invalid_object_key" }, { status: 400 });
        }

        return handleObjectRequest(request, env, ctx, decodeURIComponent(objectKey));
      }

      const roomMatch = pathname.match(/^\/rooms\/([^/]+)(?:\/events)?$/);
      if (roomMatch) {
        const matchedRoomId = roomMatch[1];
        if (!matchedRoomId) {
          return corsResponse({ error: "invalid_room_id" }, { status: 400 });
        }

        const roomId = decodeURIComponent(matchedRoomId);
        const id = env.ROOMS.idFromName(roomId);
        const room = env.ROOMS.get(id);
        const roomUrl = new URL(request.url);
        roomUrl.pathname = pathname;
        return room.fetch(new Request(roomUrl, request));
      }

      return corsResponse({ error: "not_found" }, { status: 404 });
    } catch (error) {
      if (error instanceof Response) {
        return withCors(error);
      }

      console.error(JSON.stringify({ message: "Unhandled API error", error: String(error) }));
      return corsResponse({ error: "internal_error" }, { status: 500 });
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

async function handleObjectRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  key: string,
): Promise<Response> {
  const normalizedKey = normalizeObjectKey(key);
  if (!normalizedKey) {
    return corsResponse({ error: "invalid_object_key" }, { status: 400 });
  }

  if (request.method === "PUT") {
    if (!request.body) {
      return corsResponse({ error: "missing_body" }, { status: 400 });
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

    return corsResponse({ key: normalizedKey }, { status: 201 });
  }

  if (request.method === "GET") {
    const object = await env.ASSETS.get(normalizedKey);
    if (!object) {
      return notFound();
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);

    return withCors(new Response(object.body, { headers }));
  }

  return corsResponse({ error: "method_not_allowed" }, { status: 405 });
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

function corsResponse(data: unknown, init: ResponseInit = {}): Response {
  return withCors(jsonResponse(data, init));
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
