import { jsonResponse, readJson } from "../http";
import { verifyRequestAuth } from "../auth/session";
import type { AuthEnv } from "../auth/types";
import type { AnalyticsAttributionContext } from "./attribution";

export type AnalyticsEventName =
  | "web_page_viewed"
  | "discover_filter_changed"
  | "discover_search_performed"
  | "companion_card_clicked"
  | "favorite_toggled"
  | "landing_cta_clicked"
  | "login_redirect_started"
  | "auth_started"
  | "auth_completed"
  | "signup_completed"
  | "companion_detail_action_clicked"
  | "first_chat_started"
  | "chat_3_messages_reached"
  | "chat_message_send_attempted"
  | "chat_message_send_completed"
  | "billing_checkout_started"
  | "billing_checkout_completed"
  | "subscription_started"
  | "credits_purchased"
  | "billing_checkout_returned";

type AnalyticsEventInput = {
  anonymous_id?: unknown;
  event_name?: unknown;
  occurred_at?: unknown;
  properties?: unknown;
  referrer_domain?: unknown;
  route_name?: unknown;
  session_id?: unknown;
  utm_campaign?: unknown;
  utm_content?: unknown;
  utm_medium?: unknown;
  utm_source?: unknown;
  utm_term?: unknown;
  gbraid?: unknown;
  gclid?: unknown;
  wbraid?: unknown;
};

type AnalyticsPayload = {
  event?: AnalyticsEventInput;
  events?: AnalyticsEventInput[];
};

const RETENTION_DAYS = 180;
const MAX_BATCH_SIZE = 20;
const MAX_PROPERTIES_BYTES = 4096;
const MAX_STRING_LENGTH = 160;

const EVENT_PROPERTY_ALLOWLIST: Record<AnalyticsEventName, readonly string[]> = {
  auth_completed: ["method", "result"],
  auth_started: ["method", "redirect_target"],
  billing_checkout_completed: [
    "checkout_type",
    "credit_package_id",
    "credits",
    "amount_total",
    "currency",
    "payment_status",
    "stripe_session_id",
    "subscription_id",
    "livemode",
  ],
  billing_checkout_returned: ["status"],
  billing_checkout_started: ["checkout_type", "credit_package_id", "surface"],
  chat_3_messages_reached: ["companion_id", "chat_mode", "scene_id", "message_count"],
  chat_message_send_attempted: ["companion_id", "chat_mode", "scene_id", "message_length_bucket"],
  chat_message_send_completed: [
    "companion_id",
    "chat_mode",
    "scene_id",
    "result",
    "error_code",
    "rate_limited",
    "quota_blocked",
    "message_length_bucket",
  ],
  companion_card_clicked: [
    "companion_id",
    "source",
    "gender",
    "section",
    "rank",
    "card_position",
    "is_authenticated",
  ],
  companion_detail_action_clicked: ["companion_id", "source", "gender", "action"],
  credits_purchased: [
    "checkout_type",
    "credit_package_id",
    "credits",
    "amount_total",
    "currency",
    "payment_status",
    "stripe_session_id",
    "livemode",
  ],
  discover_filter_changed: ["filter_type", "gender", "tag", "has_query", "result_count"],
  discover_search_performed: ["query_length", "has_query", "gender", "selected_tag", "result_count"],
  favorite_toggled: ["companion_id", "source", "gender", "next_state", "surface", "result", "error_code"],
  first_chat_started: ["companion_id", "chat_mode", "scene_id", "message_count"],
  landing_cta_clicked: ["cta_id", "destination"],
  login_redirect_started: ["source_route", "redirect_target", "reason"],
  signup_completed: ["method", "result"],
  subscription_started: [
    "checkout_type",
    "amount_total",
    "currency",
    "payment_status",
    "stripe_session_id",
    "subscription_id",
    "livemode",
  ],
  web_page_viewed: [
    "route_name",
    "path_template",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "gbraid",
    "wbraid",
    "referrer_domain",
  ],
};

const FORBIDDEN_PROPERTY_KEYS = new Set([
  "chat_text",
  "content",
  "email",
  "full_url",
  "greeting",
  "message",
  "personality",
  "prompt",
  "query",
  "raw_query",
  "scenario",
  "search",
  "text",
  "token",
  "url",
]);

export async function handleAnalyticsRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  if (pathname !== "/analytics/events") return null;
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const userId = await optionalAuthUserId(env, request);
  const now = Date.now();
  const payload = await readJson<AnalyticsPayload>(request);
  const events = normalizeEventBatch(payload);
  if (events instanceof Response) return events;

  for (const event of events) {
    const normalized = normalizeEvent(event, now);
    if (normalized instanceof Response) return normalized;
    await insertAnalyticsEvent(env, {
      ...normalized,
      receivedAt: now,
      userId,
    });
  }

  return jsonResponse({ ok: true, accepted: events.length }, { status: 202 });
}

export async function cleanupOldAnalyticsEvents(env: Env, now: number = Date.now()): Promise<void> {
  const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  await env.DB.prepare(`DELETE FROM analytics_events WHERE received_at < ?`).bind(cutoff).run();
}

export async function recordAnalyticsEvent(
  env: Env,
  input: {
    anonymousId?: string | null;
    attribution?: AnalyticsAttributionContext;
    eventName: AnalyticsEventName;
    occurredAt?: number;
    properties?: Record<string, unknown>;
    routeName?: string | null;
    sessionId?: string | null;
    userId?: string | null;
  },
): Promise<void> {
  const now = Date.now();
  const properties = normalizeProperties(input.eventName, input.properties ?? {});
  if (properties instanceof Response) {
    throw new Error("invalid_internal_analytics_event");
  }
  const anonymousId = normalizedString(input.anonymousId, 120) ||
    normalizedString(input.attribution?.anonymousId, 120) ||
    (input.userId ? `user_${input.userId}` : null);
  if (!anonymousId) {
    throw new Error("analytics_event_requires_anonymous_or_user_id");
  }

  await insertAnalyticsEvent(env, {
    anonymousId,
    eventName: input.eventName,
    occurredAt: input.occurredAt ?? now,
    properties,
    receivedAt: now,
    referrerDomain: input.attribution?.referrerDomain ?? null,
    routeName: input.routeName ?? null,
    sessionId: input.sessionId ?? input.attribution?.sessionId ?? null,
    userId: input.userId ?? null,
    utmCampaign: input.attribution?.utmCampaign ?? null,
    utmContent: input.attribution?.utmContent ?? null,
    utmMedium: input.attribution?.utmMedium ?? null,
    utmSource: input.attribution?.utmSource ?? null,
    utmTerm: input.attribution?.utmTerm ?? null,
    gbraid: input.attribution?.gbraid ?? null,
    gclid: input.attribution?.gclid ?? null,
    wbraid: input.attribution?.wbraid ?? null,
  });
}

async function optionalAuthUserId(env: Env, request: Request): Promise<string | null> {
  try {
    const payload = await verifyRequestAuth(env as AuthEnv, request);
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}

function normalizeEventBatch(payload: AnalyticsPayload): AnalyticsEventInput[] | Response {
  const events = Array.isArray(payload.events)
    ? payload.events
    : payload.event
      ? [payload.event]
      : [];

  if (events.length === 0 || events.length > MAX_BATCH_SIZE) {
    return invalidPayload();
  }

  return events;
}

function normalizeEvent(event: AnalyticsEventInput, now: number): {
  gbraid: string | null;
  gclid: string | null;
  anonymousId: string;
  eventName: AnalyticsEventName;
  occurredAt: number;
  properties: Record<string, unknown>;
  referrerDomain: string | null;
  routeName: string | null;
  sessionId: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmMedium: string | null;
  utmSource: string | null;
  utmTerm: string | null;
  wbraid: string | null;
} | Response {
  const eventName = typeof event.event_name === "string" ? event.event_name : "";
  if (!isAnalyticsEventName(eventName)) return invalidPayload();

  const anonymousId = normalizedString(event.anonymous_id, 120);
  if (!anonymousId) return invalidPayload();

  const occurredAt = typeof event.occurred_at === "number" && Number.isFinite(event.occurred_at)
    ? Math.trunc(event.occurred_at)
    : now;
  if (occurredAt <= 0 || occurredAt > now + 5 * 60 * 1000) return invalidPayload();

  const properties = normalizeProperties(eventName, event.properties);
  if (properties instanceof Response) return properties;

  return {
    anonymousId,
    eventName,
    occurredAt,
    gbraid: normalizedString(event.gbraid, 160),
    gclid: normalizedString(event.gclid, 160),
    properties,
    referrerDomain: normalizedString(event.referrer_domain, 160),
    routeName: normalizedString(event.route_name, 80),
    sessionId: normalizedString(event.session_id, 120),
    utmCampaign: normalizedString(event.utm_campaign, 120),
    utmContent: normalizedString(event.utm_content, 120),
    utmMedium: normalizedString(event.utm_medium, 80),
    utmSource: normalizedString(event.utm_source, 80),
    utmTerm: normalizedString(event.utm_term, 120),
    wbraid: normalizedString(event.wbraid, 160),
  };
}

async function insertAnalyticsEvent(
  env: Env,
  input: {
    anonymousId: string;
    eventName: AnalyticsEventName;
    occurredAt: number;
    properties: Record<string, unknown>;
    receivedAt: number;
    referrerDomain: string | null;
    routeName: string | null;
    sessionId: string | null;
    userId: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmMedium: string | null;
    utmSource: string | null;
    utmTerm: string | null;
    gbraid: string | null;
    gclid: string | null;
    wbraid: string | null;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO analytics_events
       (id, event_name, anonymous_id, user_id, session_id, occurred_at, received_at,
        route_name, properties_json, utm_source, utm_medium, utm_campaign, utm_content,
        utm_term, gclid, gbraid, wbraid, referrer_domain)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      input.eventName,
      input.anonymousId,
      input.userId,
      input.sessionId,
      input.occurredAt,
      input.receivedAt,
      input.routeName,
      JSON.stringify(input.properties),
      input.utmSource,
      input.utmMedium,
      input.utmCampaign,
      input.utmContent,
      input.utmTerm,
      input.gclid,
      input.gbraid,
      input.wbraid,
      input.referrerDomain,
    )
    .run();
}

function normalizeProperties(
  eventName: AnalyticsEventName,
  raw: unknown,
): Record<string, unknown> | Response {
  if (raw === undefined || raw === null) return {};
  if (!isPlainObject(raw)) return invalidPayload();

  const allowed = new Set(EVENT_PROPERTY_ALLOWLIST[eventName]);
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (FORBIDDEN_PROPERTY_KEYS.has(key) || !allowed.has(key)) return invalidPayload();
    if (!isSafePropertyValue(value)) return invalidPayload();
    normalized[key] = typeof value === "string" ? normalizedString(value, MAX_STRING_LENGTH) : value;
  }

  if (JSON.stringify(normalized).length > MAX_PROPERTIES_BYTES) return invalidPayload();
  return normalized;
}

function isSafePropertyValue(value: unknown): boolean {
  return value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "string";
}

function normalizedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return Object.prototype.hasOwnProperty.call(EVENT_PROPERTY_ALLOWLIST, value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function invalidPayload(): Response {
  return jsonResponse({ error: "invalid_event_payload" }, { status: 400 });
}
