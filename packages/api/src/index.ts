import { API_VERSION, type HealthResponse } from "@xtbit/shared";

import { handleAdminRequest } from "./admin";
import { handleAuthRequest, requireAdminUser } from "./auth";
import { handleBillingRequest } from "./billing";
import { handleChatRequest } from "./chat";
import { handleMomentImageRequest } from "./chat/moment-routes";
import { handleCompanionsRequest } from "./companions";
import { handleCreditsRequest } from "./credits";
import { dispatchQueueBatch } from "./queue-dispatcher";
import { handleEventsRequest } from "./events";
import { jsonResponse, notFound, readJson } from "./http";
import {
  handleRunningHubWebhookRequest,
  pollStaleRunningHubArtJobs,
} from "./image-gen/runninghub-results";
import { verifySignedObjectRequest } from "./image-gen/signed-url";
import { handleActivityRequest } from "./life/activity";
import { handleMemoryRequest } from "./life/memory";
import { handleMeImageAssetsRequest } from "./me/image-assets";
import { handlePushRequest } from "./life/push";
import { handleTodayRequest } from "./life/today";
import { handleAdminLlmRequest } from "./llm";
import { handleAdminImageGenRequest } from "./image-gen/admin";
import { handleAdminSettingsRequest } from "./settings/admin";
import { handleRelationshipsRequest } from "./relationships";
import { handlePersonasRequest } from "./personas";
import { handleScenesRequest } from "./scenes";
import { enforceRateLimit, isRequestBodyTooLarge, jsonCorsResponse, withCors } from "./security";
export { GameRoom } from "./room";

type UploadMetadata = {
  contentType?: string;
  sizeBytes?: number;
};

// Endpoints removed by spec-003 (D1 schema reset).
// Each prefix is reintroduced by a later spec on top of the v1 schema:
//   /events/*           -> spec-008 (events module)
//   /show/*             -> deprecated entirely (chapter-based gameplay retired)
//   /companion/*        -> deprecated entirely (replaced by /companions and /chat)
const RETIRED_PREFIXES: ReadonlyArray<string> = [
  "/show/",
  "/companion/",
];

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const pathname = normalizeApiPath(url.pathname);

    try {
      if (request.method === "OPTIONS") {
        return await jsonCorsResponse(request, env, null);
      }

      if (await isRequestBodyTooLarge(request, env, pathname)) {
        return await jsonCorsResponse(request, env, { error: "request_body_too_large" }, { status: 413 });
      }

      const rateLimitResponse = await enforceRateLimit(env, request, pathname);
      if (rateLimitResponse) {
        return rateLimitResponse;
      }

      const runningHubWebhookResponse = await handleRunningHubWebhookRequest(request, env, pathname);
      if (runningHubWebhookResponse) {
        return await withCors(request, env, runningHubWebhookResponse);
      }

      const authResponse = await handleAuthRequest(request, env, pathname);
      if (authResponse) {
        return await withCors(request, env, authResponse);
      }

      const adminLlmResponse = await handleAdminLlmRequest(request, env, pathname);
      if (adminLlmResponse) {
        return await withCors(request, env, adminLlmResponse);
      }

      const adminImageGenResponse = await handleAdminImageGenRequest(request, env, pathname);
      if (adminImageGenResponse) {
        return await withCors(request, env, adminImageGenResponse);
      }

      const adminSettingsResponse = await handleAdminSettingsRequest(request, env, pathname);
      if (adminSettingsResponse) {
        return await withCors(request, env, adminSettingsResponse);
      }

      const adminResponse = await handleAdminRequest(request, env, pathname);
      if (adminResponse) {
        return await withCors(request, env, adminResponse);
      }

      const billingResponse = await handleBillingRequest(request, env, ctx, pathname);
      if (billingResponse) {
        return await withCors(request, env, billingResponse);
      }

      const creditsResponse = await handleCreditsRequest(request, env, pathname);
      if (creditsResponse) {
        return await withCors(request, env, creditsResponse);
      }

      const scenesResponse = await handleScenesRequest(request, env, pathname);
      if (scenesResponse) {
        return await withCors(request, env, scenesResponse);
      }

      const companionsResponse = await handleCompanionsRequest(request, env, pathname);
      if (companionsResponse) {
        return await withCors(request, env, companionsResponse);
      }

      const relationshipsResponse = await handleRelationshipsRequest(request, env, pathname);
      if (relationshipsResponse) {
        return await withCors(request, env, relationshipsResponse);
      }

      const personasResponse = await handlePersonasRequest(request, env, pathname);
      if (personasResponse) {
        return await withCors(request, env, personasResponse);
      }

      const chatResponse = await handleChatRequest(request, env, ctx, pathname);
      if (chatResponse) {
        return await withCors(request, env, chatResponse);
      }

      const momentImageResponse = await handleMomentImageRequest(request, env, pathname);
      if (momentImageResponse) {
        return await withCors(request, env, momentImageResponse);
      }

      const eventsResponse = await handleEventsRequest(request, env, pathname);
      if (eventsResponse) {
        return await withCors(request, env, eventsResponse);
      }

      const todayResponse = await handleTodayRequest(request, env, pathname);
      if (todayResponse) {
        return await withCors(request, env, todayResponse);
      }

      const activityResponse = await handleActivityRequest(request, env, pathname);
      if (activityResponse) {
        return await withCors(request, env, activityResponse);
      }

      const memoryResponse = await handleMemoryRequest(request, env, pathname);
      if (memoryResponse) {
        return await withCors(request, env, memoryResponse);
      }

      const meImageAssetsResponse = await handleMeImageAssetsRequest(request, env, pathname);
      if (meImageAssetsResponse) {
        return await withCors(request, env, meImageAssetsResponse);
      }

      const pushResponse = await handlePushRequest(request, env, pathname);
      if (pushResponse) {
        return await withCors(request, env, pushResponse);
      }

      if (isRetiredPath(pathname)) {
        return await jsonCorsResponse(
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

        return await jsonCorsResponse(request, env, body);
      }

      if (pathname === "/config/bootstrap" && request.method === "GET") {
        const config = await env.CONFIG.get("client:bootstrap", "json");
        return await jsonCorsResponse(request, env, { config: config ?? {} });
      }

      if (pathname === "/db/ping" && request.method === "GET") {
        const result = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        return await jsonCorsResponse(request, env, { ok: result?.ok === 1 });
      }

      if (pathname === "/jobs" && request.method === "POST") {
        const body = await readJson<Record<string, unknown>>(request);
        await env.JOB_QUEUE.send({
          id: crypto.randomUUID(),
          type: "manual",
          body,
          createdAt: new Date().toISOString(),
        });
        return await jsonCorsResponse(request, env, { ok: true }, { status: 202 });
      }

      const signedObjectMatch = pathname.match(/^\/objects\/signed\/(.+)$/);
      if (signedObjectMatch) {
        const objectKey = signedObjectMatch[1];
        if (!objectKey) {
          return await jsonCorsResponse(request, env, { error: "invalid_object_key" }, { status: 400 });
        }

        return handleSignedObjectRequest(request, env, decodeURIComponent(objectKey));
      }

      const objectMatch = pathname.match(/^\/objects\/(.+)$/);
      if (objectMatch) {
        const objectKey = objectMatch[1];
        if (!objectKey) {
          return await jsonCorsResponse(request, env, { error: "invalid_object_key" }, { status: 400 });
        }

        return handleObjectRequest(request, env, ctx, decodeURIComponent(objectKey));
      }

      const roomMatch = pathname.match(/^\/rooms\/([^/]+)(?:\/events)?$/);
      if (roomMatch) {
        const matchedRoomId = roomMatch[1];
        if (!matchedRoomId) {
          return await jsonCorsResponse(request, env, { error: "invalid_room_id" }, { status: 400 });
        }

        const roomId = decodeURIComponent(matchedRoomId);
        const id = env.ROOMS.idFromName(roomId);
        const room = env.ROOMS.get(id);
        const roomUrl = new URL(request.url);
        roomUrl.pathname = pathname;
        return room.fetch(new Request(roomUrl, request));
      }

      return await jsonCorsResponse(request, env, { error: "not_found" }, { status: 404 });
    } catch (error) {
      if (error instanceof Response) {
        return await withCors(request, env, error);
      }

      console.error(JSON.stringify({ message: "Unhandled API error", error: String(error) }));
      return await jsonCorsResponse(request, env, { error: "internal_error" }, { status: 500 });
    }
  },
  async queue(batch, env): Promise<void> {
    await dispatchQueueBatch(batch, env);
  },
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(pollStaleRunningHubArtJobs(env));
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
    return await jsonCorsResponse(request, env, { error: "invalid_object_key" }, { status: 400 });
  }

  if (request.method === "PUT") {
    await requireAdminUser(env, request);

    if (!request.body) {
      return await jsonCorsResponse(request, env, { error: "missing_body" }, { status: 400 });
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

    return await jsonCorsResponse(request, env, { key: normalizedKey }, { status: 201 });
  }

  if (request.method === "GET") {
    const object = await env.ASSETS.get(normalizedKey);
    if (!object) {
      return await withCors(request, env, notFound());
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);

    return await withCors(request, env, new Response(object.body, { headers }));
  }

  return await jsonCorsResponse(request, env, { error: "method_not_allowed" }, { status: 405 });
}

async function handleSignedObjectRequest(
  request: Request,
  env: Env,
  key: string,
): Promise<Response> {
  const normalizedKey = normalizeObjectKey(key);
  if (!normalizedKey) {
    return await jsonCorsResponse(request, env, { error: "invalid_object_key" }, { status: 400 });
  }

  const signedObject = await verifySignedObjectRequest(env, request, normalizedKey);
  if (!signedObject) {
    return await jsonCorsResponse(request, env, { error: "invalid_or_expired_signature" }, { status: 401 });
  }

  const object = await env.ASSETS.get(signedObject.key);
  if (!object) {
    return notFound();
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, max-age=60");
  return new Response(object.body, { headers });
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
