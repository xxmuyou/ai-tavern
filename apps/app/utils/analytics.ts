import { API_BASE_URL, AUTH_TOKEN_STORAGE_KEY } from '@/api/companion-client';

export type AnalyticsEventName =
  | 'web_page_viewed'
  | 'discover_filter_changed'
  | 'discover_search_performed'
  | 'companion_card_clicked'
  | 'favorite_toggled'
  | 'login_redirect_started'
  | 'auth_started'
  | 'auth_completed'
  | 'companion_detail_action_clicked'
  | 'chat_message_send_attempted'
  | 'chat_message_send_completed'
  | 'billing_checkout_started'
  | 'billing_checkout_returned';

export type AnalyticsProperties = Record<string, boolean | number | string | null | undefined>;

const ANONYMOUS_ID_KEY = 'xtbit.analytics.anonymousId';
const SESSION_ID_KEY = 'xtbit.analytics.sessionId';
const SESSION_STARTED_KEY = 'xtbit.analytics.sessionStartedAt';
const SESSION_TTL_MS = 30 * 60 * 1000;

export function trackWebEvent(eventName: AnalyticsEventName, properties: AnalyticsProperties = {}): void {
  if (!isAnalyticsEnabled() || typeof window === 'undefined') return;

  try {
    const attribution = currentAttribution();
    const event = {
      anonymous_id: getOrCreateAnonymousId(),
      event_name: eventName,
      occurred_at: Date.now(),
      properties: compactProperties(properties),
      referrer_domain: attribution.referrer_domain,
      route_name: typeof properties.route_name === 'string' ? properties.route_name : undefined,
      session_id: getOrCreateSessionId(),
      utm_campaign: attribution.utm_campaign,
      utm_medium: attribution.utm_medium,
      utm_source: attribution.utm_source,
    };
    const body = JSON.stringify({ events: [event] });
    const token = window.localStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '';

    if (!token && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(
        `${API_BASE_URL}/analytics/events`,
        new Blob([body], { type: 'application/json' }),
      );
      if (sent) return;
    }

    void fetch(`${API_BASE_URL}/analytics/events`, {
      body,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      keepalive: true,
      method: 'POST',
    }).catch(debugAnalyticsError);
  } catch (error) {
    debugAnalyticsError(error);
  }
}

export function trackWebPageView(routeName: string, pathTemplate: string): void {
  trackWebEvent('web_page_viewed', {
    path_template: pathTemplate,
    route_name: routeName,
  });
}

export function messageLengthBucket(length: number): string {
  if (length <= 0) return 'empty';
  if (length <= 40) return '1-40';
  if (length <= 120) return '41-120';
  if (length <= 280) return '121-280';
  return '281+';
}

function isAnalyticsEnabled(): boolean {
  const explicit = process.env.EXPO_PUBLIC_ANALYTICS_ENABLED;
  if (explicit === '1' || explicit === 'true') return true;
  if (explicit === '0' || explicit === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function getOrCreateAnonymousId(): string {
  return getOrCreateStoredId(ANONYMOUS_ID_KEY, 'anon');
}

function getOrCreateSessionId(): string {
  const now = Date.now();
  const startedAt = Number(window.sessionStorage?.getItem(SESSION_STARTED_KEY) ?? '0');
  const current = window.sessionStorage?.getItem(SESSION_ID_KEY);
  if (current && Number.isFinite(startedAt) && now - startedAt < SESSION_TTL_MS) {
    window.sessionStorage.setItem(SESSION_STARTED_KEY, String(now));
    return current;
  }
  const next = makeId('sess');
  window.sessionStorage?.setItem(SESSION_ID_KEY, next);
  window.sessionStorage?.setItem(SESSION_STARTED_KEY, String(now));
  return next;
}

function getOrCreateStoredId(key: string, prefix: string): string {
  const current = window.localStorage?.getItem(key);
  if (current) return current;
  const next = makeId(prefix);
  window.localStorage?.setItem(key, next);
  return next;
}

function makeId(prefix: string): string {
  const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

function currentAttribution(): {
  referrer_domain?: string;
  utm_campaign?: string;
  utm_medium?: string;
  utm_source?: string;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    referrer_domain: referrerDomain(document.referrer),
    utm_campaign: limited(params.get('utm_campaign')),
    utm_medium: limited(params.get('utm_medium')),
    utm_source: limited(params.get('utm_source')),
  };
}

function referrerDomain(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.hostname === window.location.hostname) return undefined;
    return limited(url.hostname);
  } catch {
    return undefined;
  }
}

function compactProperties(properties: AnalyticsProperties): Record<string, boolean | number | string | null> {
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, typeof value === 'string' ? limited(value) : value]),
  ) as Record<string, boolean | number | string | null>;
}

function limited(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 160) : undefined;
}

function debugAnalyticsError(error: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    // Analytics is intentionally best-effort and must never affect product flows.
    console.debug('Analytics event was not sent.', error);
  }
}
