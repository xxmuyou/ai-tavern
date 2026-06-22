export type AnalyticsAttributionContext = {
  anonymousId: string | null;
  gbraid: string | null;
  gclid: string | null;
  referrerDomain: string | null;
  sessionId: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmMedium: string | null;
  utmSource: string | null;
  utmTerm: string | null;
  wbraid: string | null;
};

const MAX_VALUE_LENGTH = 160;

const INPUT_TO_CONTEXT = {
  anonymous_id: "anonymousId",
  gbraid: "gbraid",
  gclid: "gclid",
  referrer_domain: "referrerDomain",
  session_id: "sessionId",
  utm_campaign: "utmCampaign",
  utm_content: "utmContent",
  utm_medium: "utmMedium",
  utm_source: "utmSource",
  utm_term: "utmTerm",
  wbraid: "wbraid",
} as const;

const CONTEXT_TO_METADATA = {
  anonymousId: "analytics_anonymous_id",
  gbraid: "gbraid",
  gclid: "gclid",
  referrerDomain: "referrer_domain",
  sessionId: "analytics_session_id",
  utmCampaign: "utm_campaign",
  utmContent: "utm_content",
  utmMedium: "utm_medium",
  utmSource: "utm_source",
  utmTerm: "utm_term",
  wbraid: "wbraid",
} as const;

export function normalizeAnalyticsAttributionContext(raw: unknown): AnalyticsAttributionContext {
  const source = isPlainObject(raw) ? raw : {};
  const context = emptyContext();
  for (const [inputKey, contextKey] of Object.entries(INPUT_TO_CONTEXT) as Array<
    [keyof typeof INPUT_TO_CONTEXT, keyof AnalyticsAttributionContext]
  >) {
    context[contextKey] = normalizedString(source[inputKey]);
  }
  return context;
}

export function analyticsContextToStripeMetadata(
  context: AnalyticsAttributionContext,
): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [contextKey, metadataKey] of Object.entries(CONTEXT_TO_METADATA) as Array<
    [keyof AnalyticsAttributionContext, string]
  >) {
    const value = context[contextKey];
    if (value) metadata[metadataKey] = value.slice(0, 500);
  }
  return metadata;
}

export function analyticsContextFromStripeMetadata(
  metadata: Record<string, string | null | undefined> | null | undefined,
): AnalyticsAttributionContext {
  const context = emptyContext();
  if (!metadata) return context;
  for (const [contextKey, metadataKey] of Object.entries(CONTEXT_TO_METADATA) as Array<
    [keyof AnalyticsAttributionContext, string]
  >) {
    context[contextKey] = normalizedString(metadata[metadataKey]);
  }
  return context;
}

function emptyContext(): AnalyticsAttributionContext {
  return {
    anonymousId: null,
    gbraid: null,
    gclid: null,
    referrerDomain: null,
    sessionId: null,
    utmCampaign: null,
    utmContent: null,
    utmMedium: null,
    utmSource: null,
    utmTerm: null,
    wbraid: null,
  };
}

function normalizedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_VALUE_LENGTH) : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
