import { buildTemplateSnapshot, isEventType, parseTemplateOptions } from "./parse";
import type { EventTemplate, EventType } from "./types";

type EventTemplateRow = {
  id: string;
  event_type: string;
  companion_filter: string;
  trigger_probability: number;
  cooldown_seconds: number;
  priority: number;
  min_closeness: number | null;
  min_trust: number | null;
  min_romance: number | null;
  min_friendship: number | null;
  max_hostility: number | null;
  max_tension: number | null;
  max_distance: number | null;
  signal_trigger: string | null;
  options_json: string;
};

export async function loadTemplateForCompanion(
  env: Env,
  eventType: EventType,
  companionId: string,
): Promise<EventTemplate | null> {
  const row = await env.DB.prepare(
    `SELECT id, event_type, companion_filter, trigger_probability, cooldown_seconds, priority,
            min_closeness, min_trust, min_romance, min_friendship,
            max_hostility, max_tension, max_distance,
            signal_trigger, options_json
     FROM event_templates
     WHERE event_type = ? AND companion_filter IN (?, 'all') AND is_active = 1
     ORDER BY CASE WHEN companion_filter = ? THEN 0 ELSE 1 END
     LIMIT 1`,
  )
    .bind(eventType, companionId, companionId)
    .first<EventTemplateRow>();

  return row ? mapTemplate(row) : null;
}

export function snapshotForTemplate(template: EventTemplate) {
  return buildTemplateSnapshot({
    companion_filter: template.companion_filter,
    event_type: template.event_type,
    options: template.options,
    template_id: template.id,
  });
}

function mapTemplate(row: EventTemplateRow): EventTemplate | null {
  if (!isEventType(row.event_type)) return null;
  return {
    companion_filter: row.companion_filter,
    cooldown_seconds: row.cooldown_seconds,
    event_type: row.event_type,
    id: row.id,
    max_distance: row.max_distance,
    max_hostility: row.max_hostility,
    max_tension: row.max_tension,
    min_closeness: row.min_closeness,
    min_friendship: row.min_friendship,
    min_romance: row.min_romance,
    min_trust: row.min_trust,
    options: parseTemplateOptions(row.options_json),
    priority: row.priority,
    signal_trigger: row.signal_trigger,
    trigger_probability: row.trigger_probability,
  };
}
