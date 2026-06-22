const ANONYMOUS_ID_KEY = 'xtbit.analytics.anonymousId';
const SESSION_ID_KEY = 'xtbit.analytics.sessionId';
const SESSION_STARTED_KEY = 'xtbit.analytics.sessionStartedAt';
const ATTRIBUTION_KEY = 'xtbit.analytics.attribution';
const SESSION_TTL_MS = 30 * 60 * 1000;

const ATTRIBUTION_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'gclid',
  'gbraid',
  'wbraid',
] as const;

export type AnalyticsAttribution = Partial<Record<typeof ATTRIBUTION_KEYS[number], string>> & {
  referrer_domain?: string;
};

export type AnalyticsContext = AnalyticsAttribution & {
  anonymous_id: string;
  session_id: string;
};

export function readAnalyticsContext(): AnalyticsContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const attribution = currentAttribution();
  return {
    ...attribution,
    anonymous_id: getOrCreateAnonymousId(),
    session_id: getOrCreateSessionId(),
  };
}

export function currentAttribution(): AnalyticsAttribution {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const incoming: AnalyticsAttribution = {
    gbraid: limited(params.get('gbraid')),
    gclid: limited(params.get('gclid')),
    referrer_domain: referrerDomain(document.referrer),
    utm_campaign: limited(params.get('utm_campaign')),
    utm_content: limited(params.get('utm_content')),
    utm_medium: limited(params.get('utm_medium')),
    utm_source: limited(params.get('utm_source')),
    utm_term: limited(params.get('utm_term')),
    wbraid: limited(params.get('wbraid')),
  };
  const stored = readStoredAttribution();
  const hasIncomingAdSignal = ATTRIBUTION_KEYS.some((key) => incoming[key]);
  const next = {
    ...stored,
    ...compactAttribution(incoming),
    referrer_domain: incoming.referrer_domain ?? stored.referrer_domain,
  };
  if (hasIncomingAdSignal) writeStoredAttribution(next);
  return next;
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

function readStoredAttribution(): AnalyticsAttribution {
  try {
    const raw = window.localStorage?.getItem(ATTRIBUTION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const attribution: AnalyticsAttribution = {};
    for (const key of [...ATTRIBUTION_KEYS, 'referrer_domain'] as const) {
      const value = parsed[key];
      if (typeof value === 'string') {
        attribution[key] = limited(value);
      }
    }
    return attribution;
  } catch {
    return {};
  }
}

function writeStoredAttribution(value: AnalyticsAttribution): void {
  try {
    window.localStorage?.setItem(ATTRIBUTION_KEY, JSON.stringify(compactAttribution(value)));
  } catch {
    // Attribution persistence must never block app flows.
  }
}

function compactAttribution(value: AnalyticsAttribution): AnalyticsAttribution {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => typeof item === 'string' && item.length > 0),
  ) as AnalyticsAttribution;
}

function limited(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 160) : undefined;
}
