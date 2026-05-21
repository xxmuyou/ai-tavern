import { parseEventPayload, stringifyJson } from "./parse";
import type {
  EventPayload,
  EventResponseItem,
  EventRow,
  EventTemplate,
  EventTemplateSnapshot,
  EventType,
} from "./types";

export async function createPendingEvent(
  env: Env,
  args: {
    userId: string;
    companionId: string;
    sceneId: string | null;
    eventType: EventType;
    template: EventTemplate;
    snapshot: EventTemplateSnapshot;
    payload: EventPayload;
    metadata: Record<string, unknown> | null;
    now: number;
  },
): Promise<EventResponseItem> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO events
       (id, user_id, companion_id, scene_id, event_type, template_id, template_snapshot,
        payload, metadata, status, resolution, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL)`,
  )
    .bind(
      id,
      args.userId,
      args.companionId,
      args.sceneId,
      args.eventType,
      args.template.id,
      stringifyJson(args.snapshot),
      stringifyJson(args.payload),
      args.metadata ? stringifyJson(args.metadata) : null,
      args.now,
    )
    .run();

  return {
    companion_id: args.companionId,
    created_at: args.now,
    event_type: args.eventType,
    id,
    payload: args.payload,
    scene_id: args.sceneId,
  };
}

export async function loadEventById(env: Env, eventId: string): Promise<EventRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, companion_id, scene_id, event_type, template_id, template_snapshot,
            payload, metadata, status, resolution, created_at, resolved_at
     FROM events
     WHERE id = ?`,
  )
    .bind(eventId)
    .first<EventRow>();
}

export function toEventResponse(row: EventRow): EventResponseItem {
  return {
    companion_id: row.companion_id,
    created_at: row.created_at,
    event_type: row.event_type as EventType,
    id: row.id,
    payload: parseEventPayload(row.payload),
    scene_id: row.scene_id,
  };
}
