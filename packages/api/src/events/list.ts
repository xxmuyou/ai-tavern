import { jsonResponse } from "../http";
import type { UserRecord } from "../identity";
import { parseEventStatus } from "./parse";
import { toEventResponse, loadEventById } from "./repository";
import type { EventRow } from "./types";

export async function listEvents(request: Request, env: Env, user: UserRecord): Promise<Response> {
  const url = new URL(request.url);
  const status = parseEventStatus(url.searchParams.get("status"));
  if (!status) {
    return jsonResponse({ error: "invalid_status" }, { status: 400 });
  }

  const limit = clampLimit(url.searchParams.get("limit"));
  const beforeId = url.searchParams.get("before_id");
  let beforeCreatedAt: number | null = null;
  if (beforeId) {
    const cursor = await loadEventById(env, beforeId);
    if (!cursor || cursor.user_id !== user.id) {
      return jsonResponse({ error: "invalid_cursor" }, { status: 400 });
    }
    beforeCreatedAt = cursor.created_at;
  }

  const params: unknown[] = [user.id, status];
  let beforeSql = "";
  if (beforeCreatedAt !== null) {
    beforeSql = "AND created_at < ?";
    params.push(beforeCreatedAt);
  }
  params.push(limit);

  const { results } = await env.DB.prepare(
    `SELECT id, user_id, companion_id, scene_id, event_type, template_id, template_snapshot,
            payload, metadata, status, resolution, created_at, resolved_at
     FROM events
     WHERE user_id = ? AND status = ? ${beforeSql}
     ORDER BY created_at DESC
     LIMIT ?`,
  )
    .bind(...params)
    .all<EventRow>();

  return jsonResponse({ events: (results ?? []).map(toEventResponse) });
}

function clampLimit(raw: string | null): number {
  const parsed = raw ? Number(raw) : 20;
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.min(50, Math.floor(parsed));
}
