import { API_BASE_URL, AUTH_TOKEN_STORAGE_KEY } from '@/api/companion-client';
import { readAnalyticsContext } from '@/utils/analytics-context';

export type AnalyticsEventName =
  | 'web_page_viewed'
  | 'discover_filter_changed'
  | 'discover_search_performed'
  | 'companion_card_clicked'
  | 'favorite_toggled'
  | 'landing_cta_clicked'
  | 'login_redirect_started'
  | 'auth_started'
  | 'auth_completed'
  | 'signup_completed'
  | 'companion_detail_action_clicked'
  | 'first_chat_started'
  | 'chat_3_messages_reached'
  | 'chat_message_send_attempted'
  | 'chat_message_send_completed'
  | 'billing_checkout_started'
  | 'billing_checkout_completed'
  | 'subscription_started'
  | 'credits_purchased'
  | 'billing_checkout_returned';

export type AnalyticsProperties = Record<string, boolean | number | string | null | undefined>;

const SIGNUP_CONVERSION_KEY = 'xtbit.analytics.signupCompletedTracked';
const FIRST_CHAT_KEY_PREFIX = 'xtbit.analytics.firstChatStarted.';
const CHAT_3_MESSAGES_KEY_PREFIX = 'xtbit.analytics.chat3MessagesReached.';

export function trackWebEvent(eventName: AnalyticsEventName, properties: AnalyticsProperties = {}): void {
  if (!isAnalyticsEnabled() || typeof window === 'undefined') return;

  try {
    const analyticsContext = readAnalyticsContext();
    if (!analyticsContext) return;
    const event = {
      anonymous_id: analyticsContext.anonymous_id,
      event_name: eventName,
      occurred_at: Date.now(),
      properties: compactProperties(properties),
      referrer_domain: analyticsContext.referrer_domain,
      route_name: typeof properties.route_name === 'string' ? properties.route_name : undefined,
      session_id: analyticsContext.session_id,
      utm_campaign: analyticsContext.utm_campaign,
      utm_content: analyticsContext.utm_content,
      utm_medium: analyticsContext.utm_medium,
      utm_source: analyticsContext.utm_source,
      utm_term: analyticsContext.utm_term,
      gclid: analyticsContext.gclid,
      gbraid: analyticsContext.gbraid,
      wbraid: analyticsContext.wbraid,
    };
    const body = JSON.stringify({ events: [event] });
    const token = window.localStorage?.getItem(AUTH_TOKEN_STORAGE_KEY) ?? '';
    trackGoogleAdsConversion(eventName, event.properties);

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

export function trackWebPageView(
  routeName: string,
  pathTemplate: string,
  properties: AnalyticsProperties = {},
): void {
  trackWebEvent('web_page_viewed', {
    ...properties,
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

export function trackSignupCompleted(method?: string | null): void {
  if (typeof window !== 'undefined' && window.localStorage?.getItem(SIGNUP_CONVERSION_KEY)) return;
  trackWebEvent('signup_completed', {
    method: method ?? null,
    result: 'success',
  });
  try {
    window.localStorage?.setItem(SIGNUP_CONVERSION_KEY, String(Date.now()));
  } catch {
    // Best-effort dedupe only.
  }
}

export function trackChatActivationMilestones(input: {
  chatMode: string;
  companionId: string;
  messageCount: number;
  sceneId?: string | null;
}): void {
  if (typeof window === 'undefined') return;
  const firstKey = `${FIRST_CHAT_KEY_PREFIX}${input.companionId}`;
  const thirdKey = `${CHAT_3_MESSAGES_KEY_PREFIX}${input.companionId}`;

  if (input.messageCount >= 1 && !window.localStorage?.getItem(firstKey)) {
    trackWebEvent('first_chat_started', {
      chat_mode: input.chatMode,
      companion_id: input.companionId,
      message_count: input.messageCount,
      scene_id: input.sceneId ?? null,
    });
    try {
      window.localStorage?.setItem(firstKey, String(Date.now()));
    } catch {
      // Best-effort dedupe only.
    }
  }

  if (input.messageCount >= 3 && !window.localStorage?.getItem(thirdKey)) {
    trackWebEvent('chat_3_messages_reached', {
      chat_mode: input.chatMode,
      companion_id: input.companionId,
      message_count: input.messageCount,
      scene_id: input.sceneId ?? null,
    });
    try {
      window.localStorage?.setItem(thirdKey, String(Date.now()));
    } catch {
      // Best-effort dedupe only.
    }
  }
}

function isAnalyticsEnabled(): boolean {
  const explicit = process.env.EXPO_PUBLIC_ANALYTICS_ENABLED;
  if (explicit === '1' || explicit === 'true') return true;
  if (explicit === '0' || explicit === 'false') return false;
  return process.env.NODE_ENV === 'production';
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

function trackGoogleAdsConversion(eventName: AnalyticsEventName, properties: AnalyticsProperties): void {
  if (typeof window === 'undefined') return;
  const adsId = process.env.EXPO_PUBLIC_GOOGLE_ADS_ID;
  const label = googleAdsConversionLabel(eventName);
  if (!adsId || !label) return;

  const gtag = ensureGtag(adsId);
  if (!gtag) return;

  gtag('event', 'conversion', {
    currency: typeof properties.currency === 'string' ? properties.currency.toUpperCase() : 'USD',
    send_to: `${adsId}/${label}`,
    value: typeof properties.amount_total === 'number' ? properties.amount_total / 100 : undefined,
  });
}

function googleAdsConversionLabel(eventName: AnalyticsEventName): string | undefined {
  switch (eventName) {
    case 'signup_completed':
      return process.env.EXPO_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL;
    case 'first_chat_started':
      return process.env.EXPO_PUBLIC_GOOGLE_ADS_FIRST_CHAT_LABEL;
    case 'chat_3_messages_reached':
      return process.env.EXPO_PUBLIC_GOOGLE_ADS_CHAT_3_MESSAGES_LABEL;
    case 'billing_checkout_started':
      return process.env.EXPO_PUBLIC_GOOGLE_ADS_CHECKOUT_STARTED_LABEL;
    case 'billing_checkout_completed':
    case 'billing_checkout_returned':
      return process.env.EXPO_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL;
    default:
      return undefined;
  }
}

type Gtag = (...args: unknown[]) => void;

function ensureGtag(adsId: string): Gtag | null {
  const win = window as typeof window & {
    dataLayer?: unknown[];
    gtag?: Gtag;
  };
  win.dataLayer = win.dataLayer ?? [];
  win.gtag = win.gtag ?? function gtag(...args: unknown[]) {
    win.dataLayer?.push(args);
  };

  if (!document.querySelector(`script[data-google-ads-id="${adsId}"]`)) {
    const script = document.createElement('script');
    script.async = true;
    script.dataset.googleAdsId = adsId;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`;
    document.head.appendChild(script);
    win.gtag('js', new Date());
    win.gtag('config', adsId);
  }
  return win.gtag;
}

function debugAnalyticsError(error: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    // Analytics is intentionally best-effort and must never affect product flows.
    console.debug('Analytics event was not sent.', error);
  }
}
