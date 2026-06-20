import { requireAdminUser } from "../auth";
import { createStripeClient } from "../billing/stripe";
import { jsonResponse } from "../http";
import { getSetting } from "../settings/store";

type AnalyticsWindow = "today" | "7d" | "30d";
type RevenueWindow = { fromSec: number; toSec: number };

type AnalyticsSummary = {
  total_users: number;
  new_users: number;
  active_users: number;
  pro_users: number;
  free_users: number;
  active_subscriptions: number;
  credits_revenue_usd: number;
  subscription_revenue_usd: number;
  gross_revenue_usd: number;
};

type TierBreakdownItem = {
  tier: "free" | "pro";
  count: number;
};

type SubscriptionStatusBreakdownItem = {
  status: string;
  count: number;
};

type SignupPoint = {
  date_utc: string;
  users: number;
};

type RevenuePoint = {
  date_utc: string;
  credits_revenue_usd: number;
  subscription_revenue_usd: number;
  gross_revenue_usd: number;
};

type UserListItem = {
  user_id: string;
  email: string;
  tier: "free" | "pro";
  subscription_status: string | null;
  created_at: string;
  last_seen_at: string;
};

type RevenueStatus = {
  available: boolean;
  message: string | null;
};

type BehaviorFunnel = {
  authenticated_users: number;
  chat_starters: number;
  checkout_starters: number;
  companion_clickers: number;
  message_senders: number;
  visitors: number;
};

type BehaviorEventCounts = {
  billing_checkout_starts: number;
  chat_failures: number;
  chat_successes: number;
  chat_attempts: number;
  companion_card_clicks: number;
  favorites: number;
  page_views: number;
};

type BehaviorTopCompanion = {
  companion_id: string;
  clicks: number;
  favorites: number;
  gender: string | null;
  chat_starts: number;
  source: string | null;
};

type BehaviorAnalytics = {
  event_counts: BehaviorEventCounts;
  funnel: BehaviorFunnel;
  top_companions: BehaviorTopCompanion[];
};

type CursorPayload = {
  created_at: number;
  user_id: string;
};

type CreditsRevenueSession = {
  id?: string;
  created: number | null;
  amount_total: number | null;
  payment_status?: string | null;
  metadata?: Record<string, string | null | undefined> | null;
};

type SubscriptionRevenueInvoice = {
  id?: string;
  created: number | null;
  amount_paid: number | null;
  lines?: {
    data?: Array<{ price?: { id?: string | null } | null }>;
  } | null;
};

type AnalyticsDeps = {
  now?: () => number;
  createStripeClient?: typeof createStripeClient;
  listCreditsRevenueSessions?: (
    stripe: ReturnType<typeof createStripeClient>,
    range: RevenueWindow,
  ) => Promise<CreditsRevenueSession[]>;
  listSubscriptionRevenueInvoices?: (
    stripe: ReturnType<typeof createStripeClient>,
    range: RevenueWindow,
  ) => Promise<SubscriptionRevenueInvoice[]>;
};

const DEFAULT_USER_LIST_LIMIT = 20;
const MAX_USER_LIST_LIMIT = 100;
const RECENT_SIGNUPS_LIMIT = 20;
const VALID_WINDOWS: readonly AnalyticsWindow[] = ["today", "7d", "30d"];

export async function handleAdminAnalyticsRequest(
  request: Request,
  env: Env,
  pathname: string,
  deps: AnalyticsDeps = {},
): Promise<Response | null> {
  if (pathname === "/admin/analytics/overview") {
    return guard(() => (
      request.method === "GET"
        ? handleOverview(request, env, deps)
        : Promise.resolve(jsonResponse({ error: "method_not_allowed" }, { status: 405 }))
    ));
  }

  if (pathname === "/admin/users/list") {
    return guard(() => (
      request.method === "GET"
        ? handleUserList(request, env, deps)
        : Promise.resolve(jsonResponse({ error: "method_not_allowed" }, { status: 405 }))
    ));
  }

  return null;
}

async function handleOverview(
  request: Request,
  env: Env,
  deps: AnalyticsDeps,
): Promise<Response> {
  await requireAdminUser(env, request);

  const url = new URL(request.url);
  const window = parseWindow(url.searchParams.get("window"));
  if (window instanceof Response) return window;

  const now = (deps.now ?? Date.now)();
  const range = rangeForWindow(window, now);
  const [userMetrics, signupsByDay, recentSignups, revenue, behavior] = await Promise.all([
    loadUserMetrics(env, now, range),
    loadSignupTrend(env, range),
    listUsersByRecentSignup(env, now, { limit: RECENT_SIGNUPS_LIMIT }),
    loadRevenueMetrics(env, range, deps),
    loadBehaviorMetrics(env, range),
  ]);

  return jsonResponse({
    behavior,
    window,
    from: new Date(range.fromMs).toISOString(),
    to: new Date(range.toMs).toISOString(),
    summary: {
      total_users: userMetrics.total_users,
      new_users: userMetrics.new_users,
      active_users: userMetrics.active_users,
      pro_users: userMetrics.pro_users,
      free_users: userMetrics.free_users,
      active_subscriptions: userMetrics.active_subscriptions,
      credits_revenue_usd: revenue.summary.credits_revenue_usd,
      subscription_revenue_usd: revenue.summary.subscription_revenue_usd,
      gross_revenue_usd: revenue.summary.gross_revenue_usd,
    } satisfies AnalyticsSummary,
    tier_breakdown: userMetrics.tier_breakdown,
    subscription_status_breakdown: userMetrics.subscription_status_breakdown,
    signups_by_day: signupsByDay,
    revenue_by_day: revenue.by_day,
    recent_signups: recentSignups.items,
    revenue_status: revenue.status,
  });
}

async function handleUserList(
  request: Request,
  env: Env,
  deps: AnalyticsDeps,
): Promise<Response> {
  await requireAdminUser(env, request);

  const url = new URL(request.url);
  const sort = url.searchParams.get("sort") ?? "recent_signup";
  if (sort !== "recent_signup") {
    return jsonResponse({ error: "invalid_sort" }, { status: 400 });
  }

  const limit = parseLimit(url.searchParams.get("limit"));
  if (limit instanceof Response) return limit;

  const cursor = parseCursor(url.searchParams.get("cursor"));
  if (cursor instanceof Response) return cursor;

  const now = (deps.now ?? Date.now)();
  const items = await listUsersByRecentSignup(env, now, {
    cursor,
    limit,
  });

  return jsonResponse({
    sort: "recent_signup",
    items: items.items,
    next_cursor: items.next_cursor,
  });
}

async function loadUserMetrics(
  env: Env,
  now: number,
  range: { fromMs: number; toMs: number },
): Promise<{
  total_users: number;
  new_users: number;
  active_users: number;
  pro_users: number;
  free_users: number;
  active_subscriptions: number;
  tier_breakdown: TierBreakdownItem[];
  subscription_status_breakdown: SubscriptionStatusBreakdownItem[];
}> {
  const [totalsRow, newUsersRow, activeUsersRow, tierRows, statusRows] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS total_users
       FROM users`,
    ).first<{ total_users: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS new_users
       FROM users
       WHERE created_at >= ? AND created_at < ?`,
    )
      .bind(range.fromMs, range.toMs)
      .first<{ new_users: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS active_users
       FROM users
       WHERE last_seen_at >= ?`,
    )
      .bind(range.fromMs)
      .first<{ active_users: number }>(),
    env.DB.prepare(
      `SELECT
         CASE WHEN active_sub.user_id IS NULL THEN 'free' ELSE 'pro' END AS tier,
         COUNT(*) AS count
       FROM users u
       LEFT JOIN (
         SELECT DISTINCT user_id
         FROM billing_subscriptions
         WHERE status IN ('active', 'trialing')
           AND current_period_end > ?
       ) active_sub
         ON active_sub.user_id = u.id
       GROUP BY tier`,
    )
      .bind(now)
      .all<{ tier: "free" | "pro"; count: number }>(),
    env.DB.prepare(
      `WITH ranked AS (
         SELECT
           user_id,
           status,
           ROW_NUMBER() OVER (
             PARTITION BY user_id
             ORDER BY current_period_end DESC, updated_at DESC, id DESC
           ) AS rn
         FROM billing_subscriptions
       )
       SELECT status, COUNT(*) AS count
       FROM ranked
       WHERE rn = 1
       GROUP BY status
       ORDER BY count DESC, status ASC`,
    ).all<{ status: string; count: number }>(),
  ]);

  const tierBreakdown = normalizeTierBreakdown(tierRows.results ?? []);
  const proUsers = tierBreakdown.find((item) => item.tier === "pro")?.count ?? 0;
  const freeUsers = tierBreakdown.find((item) => item.tier === "free")?.count ?? 0;

  return {
    total_users: totalsRow?.total_users ?? 0,
    new_users: newUsersRow?.new_users ?? 0,
    active_users: activeUsersRow?.active_users ?? 0,
    pro_users: proUsers,
    free_users: freeUsers,
    active_subscriptions: proUsers,
    tier_breakdown: tierBreakdown,
    subscription_status_breakdown: (statusRows.results ?? []).map((row) => ({
      status: row.status,
      count: row.count ?? 0,
    })),
  };
}

async function loadBehaviorMetrics(
  env: Env,
  range: { fromMs: number; toMs: number },
): Promise<BehaviorAnalytics> {
  const [funnelRow, eventRows, topRows] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(DISTINCT anonymous_id) AS visitors,
         COUNT(DISTINCT user_id) AS authenticated_users,
         COUNT(DISTINCT CASE WHEN event_name = 'companion_card_clicked' THEN anonymous_id END) AS companion_clickers,
         COUNT(DISTINCT CASE
           WHEN event_name = 'companion_detail_action_clicked'
            AND json_extract(properties_json, '$.action') = 'start_chat'
           THEN anonymous_id END) AS chat_starters,
         COUNT(DISTINCT CASE WHEN event_name = 'chat_message_send_completed' THEN anonymous_id END) AS message_senders,
         COUNT(DISTINCT CASE WHEN event_name = 'billing_checkout_started' THEN anonymous_id END) AS checkout_starters
       FROM analytics_events
       WHERE received_at >= ? AND received_at < ?`,
    )
      .bind(range.fromMs, range.toMs)
      .first<BehaviorFunnel>(),
    env.DB.prepare(
      `SELECT event_name, COUNT(*) AS count
       FROM analytics_events
       WHERE received_at >= ? AND received_at < ?
       GROUP BY event_name`,
    )
      .bind(range.fromMs, range.toMs)
      .all<{ event_name: string; count: number }>(),
    env.DB.prepare(
      `SELECT
         json_extract(properties_json, '$.companion_id') AS companion_id,
         MAX(json_extract(properties_json, '$.source')) AS source,
         MAX(json_extract(properties_json, '$.gender')) AS gender,
         SUM(CASE WHEN event_name = 'companion_card_clicked' THEN 1 ELSE 0 END) AS clicks,
         SUM(CASE WHEN event_name = 'favorite_toggled' THEN 1 ELSE 0 END) AS favorites,
         SUM(CASE
           WHEN event_name = 'companion_detail_action_clicked'
            AND json_extract(properties_json, '$.action') = 'start_chat'
           THEN 1 ELSE 0 END) AS chat_starts
       FROM analytics_events
       WHERE received_at >= ? AND received_at < ?
         AND event_name IN ('companion_card_clicked', 'favorite_toggled', 'companion_detail_action_clicked')
         AND json_extract(properties_json, '$.companion_id') IS NOT NULL
       GROUP BY companion_id
       ORDER BY chat_starts DESC, clicks DESC, favorites DESC, companion_id ASC
       LIMIT 10`,
    )
      .bind(range.fromMs, range.toMs)
      .all<BehaviorTopCompanion>(),
  ]);

  const counts = new Map((eventRows.results ?? []).map((row) => [row.event_name, row.count ?? 0]));
  const chatCompletedCount = counts.get("chat_message_send_completed") ?? 0;
  const chatFailureRow = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM analytics_events
     WHERE received_at >= ? AND received_at < ?
       AND event_name = 'chat_message_send_completed'
       AND json_extract(properties_json, '$.result') = 'failed'`,
  )
    .bind(range.fromMs, range.toMs)
    .first<{ count: number }>();
  const chatFailures = chatFailureRow?.count ?? 0;

  return {
    funnel: {
      visitors: funnelRow?.visitors ?? 0,
      authenticated_users: funnelRow?.authenticated_users ?? 0,
      companion_clickers: funnelRow?.companion_clickers ?? 0,
      chat_starters: funnelRow?.chat_starters ?? 0,
      message_senders: funnelRow?.message_senders ?? 0,
      checkout_starters: funnelRow?.checkout_starters ?? 0,
    },
    event_counts: {
      page_views: counts.get("web_page_viewed") ?? 0,
      companion_card_clicks: counts.get("companion_card_clicked") ?? 0,
      favorites: counts.get("favorite_toggled") ?? 0,
      chat_attempts: counts.get("chat_message_send_attempted") ?? 0,
      chat_successes: Math.max(0, chatCompletedCount - chatFailures),
      chat_failures: chatFailures,
      billing_checkout_starts: counts.get("billing_checkout_started") ?? 0,
    },
    top_companions: (topRows.results ?? []).map((row) => ({
      companion_id: row.companion_id,
      source: row.source ?? null,
      gender: row.gender ?? null,
      clicks: row.clicks ?? 0,
      favorites: row.favorites ?? 0,
      chat_starts: row.chat_starts ?? 0,
    })),
  };
}

async function loadSignupTrend(
  env: Env,
  range: { fromMs: number; toMs: number },
): Promise<SignupPoint[]> {
  const result = await env.DB.prepare(
    `SELECT
       date(created_at / 1000, 'unixepoch') AS date_utc,
       COUNT(*) AS users
     FROM users
     WHERE created_at >= ? AND created_at < ?
     GROUP BY date_utc
     ORDER BY date_utc ASC`,
  )
    .bind(range.fromMs, range.toMs)
    .all<{ date_utc: string; users: number }>();

  const byDate = new Map(
    (result.results ?? []).map((row) => [row.date_utc, row.users ?? 0]),
  );
  return buildDateSeries(range).map((date_utc) => ({
    date_utc,
    users: byDate.get(date_utc) ?? 0,
  }));
}

async function listUsersByRecentSignup(
  env: Env,
  now: number,
  options: { cursor?: CursorPayload | null; limit: number },
): Promise<{ items: UserListItem[]; next_cursor: string | null }> {
  const limit = Math.min(options.limit, MAX_USER_LIST_LIMIT);
  const where =
    options.cursor
      ? "WHERE (u.created_at < ? OR (u.created_at = ? AND u.id < ?))"
      : "";
  const binds = options.cursor
    ? [now, options.cursor.created_at, options.cursor.created_at, options.cursor.user_id, limit + 1]
    : [now, limit + 1];

  const result = await env.DB.prepare(
    `WITH latest_subscription AS (
       SELECT
         user_id,
         status,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY current_period_end DESC, updated_at DESC, id DESC
         ) AS rn
       FROM billing_subscriptions
     ),
     active_subscription AS (
       SELECT DISTINCT user_id
       FROM billing_subscriptions
       WHERE status IN ('active', 'trialing')
         AND current_period_end > ?
     )
     SELECT
       u.id AS user_id,
       u.email AS email,
       u.created_at AS created_at,
       u.last_seen_at AS last_seen_at,
       CASE WHEN active_subscription.user_id IS NULL THEN 'free' ELSE 'pro' END AS tier,
       latest_subscription.status AS subscription_status
     FROM users u
     LEFT JOIN latest_subscription
       ON latest_subscription.user_id = u.id AND latest_subscription.rn = 1
     LEFT JOIN active_subscription
       ON active_subscription.user_id = u.id
     ${where}
     ORDER BY u.created_at DESC, u.id DESC
     LIMIT ?`,
  )
    .bind(...binds)
    .all<{
      user_id: string;
      email: string;
      created_at: number;
      last_seen_at: number;
      tier: "free" | "pro";
      subscription_status: string | null;
    }>();

  const rows = result.results ?? [];
  const hasNext = rows.length > limit;
  const pageRows = hasNext ? rows.slice(0, limit) : rows;

  return {
    items: pageRows.map((row) => ({
      user_id: row.user_id,
      email: row.email,
      tier: row.tier,
      subscription_status: row.subscription_status,
      created_at: new Date(row.created_at).toISOString(),
      last_seen_at: new Date(row.last_seen_at).toISOString(),
    })),
    next_cursor: hasNext
      ? encodeCursor({
          created_at: pageRows[pageRows.length - 1]!.created_at,
          user_id: pageRows[pageRows.length - 1]!.user_id,
        })
      : null,
  };
}

async function loadRevenueMetrics(
  env: Env,
  range: { fromMs: number; toMs: number },
  deps: AnalyticsDeps,
): Promise<{
  summary: Pick<AnalyticsSummary, "credits_revenue_usd" | "subscription_revenue_usd" | "gross_revenue_usd">;
  by_day: RevenuePoint[];
  status: RevenueStatus;
}> {
  const stripeSecretKey = await getSetting(env, "billing.stripe_secret_key");
  if (!stripeSecretKey) {
    return emptyRevenue(range, "Stripe secret key is not configured.");
  }

  const revenueWindow = toRevenueWindow(range);
  const stripe = (deps.createStripeClient ?? createStripeClient)({ secretKey: stripeSecretKey });

  const creditsPromise = (deps.listCreditsRevenueSessions ?? listCreditsRevenueSessions)(stripe, revenueWindow)
    .then((sessions) => summarizeCreditsRevenue(sessions, range))
    .catch(() => ({
      byDate: new Map<string, number>(),
      error: "Credits revenue is unavailable right now.",
      total: 0,
    }));

  const proMonthlyPriceId = await getSetting(env, "billing.pro_monthly_price");
  const subscriptionsPromise = proMonthlyPriceId
    ? (deps.listSubscriptionRevenueInvoices ?? listSubscriptionRevenueInvoices)(stripe, revenueWindow)
      .then((invoices) => summarizeSubscriptionRevenue(invoices, proMonthlyPriceId, range))
      .catch(() => ({
        byDate: new Map<string, number>(),
        error: "Subscription revenue is unavailable right now.",
        total: 0,
      }))
    : Promise.resolve({
      byDate: new Map<string, number>(),
      error: "Pro monthly price is not configured.",
      total: 0,
    });

  const [credits, subscriptions] = await Promise.all([creditsPromise, subscriptionsPromise]);
  const by_day = buildDateSeries(range).map((date_utc) => {
    const creditsRevenue = roundUsd(credits.byDate.get(date_utc) ?? 0);
    const subscriptionRevenue = roundUsd(subscriptions.byDate.get(date_utc) ?? 0);
    return {
      date_utc,
      credits_revenue_usd: creditsRevenue,
      subscription_revenue_usd: subscriptionRevenue,
      gross_revenue_usd: roundUsd(creditsRevenue + subscriptionRevenue),
    };
  });

  const errors = [credits.error, subscriptions.error].filter((value): value is string => Boolean(value));
  return {
    summary: {
      credits_revenue_usd: roundUsd(credits.total),
      subscription_revenue_usd: roundUsd(subscriptions.total),
      gross_revenue_usd: roundUsd(credits.total + subscriptions.total),
    },
    by_day,
    status: {
      available: errors.length === 0,
      message: errors.length > 0 ? errors.join(" ") : null,
    },
  };
}

async function listCreditsRevenueSessions(
  stripe: ReturnType<typeof createStripeClient>,
  range: RevenueWindow,
): Promise<CreditsRevenueSession[]> {
  const items: CreditsRevenueSession[] = [];
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.checkout.sessions.list({
      created: { gte: range.fromSec, lte: range.toSec },
      limit: 100,
      starting_after: startingAfter,
    });
    items.push(...page.data.map((session) => ({
      id: session.id,
      created: session.created ?? null,
      amount_total: session.amount_total ?? null,
      payment_status: session.payment_status ?? null,
      metadata: session.metadata ?? null,
    })));
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]?.id;
  }

  return items;
}

async function listSubscriptionRevenueInvoices(
  stripe: ReturnType<typeof createStripeClient>,
  range: RevenueWindow,
): Promise<SubscriptionRevenueInvoice[]> {
  const items: SubscriptionRevenueInvoice[] = [];
  let startingAfter: string | undefined;

  while (true) {
    const page = await stripe.invoices.list({
      created: { gte: range.fromSec, lte: range.toSec },
      expand: ["data.lines.data.price"],
      limit: 100,
      starting_after: startingAfter,
      status: "paid",
    });
    items.push(...page.data.map((invoice) => ({
      id: invoice.id,
      created: invoice.created ?? null,
      amount_paid: invoice.amount_paid ?? null,
      lines: {
        data: (invoice.lines?.data ?? []).map((line) => {
          const price = (line as { price?: { id?: string | null } | null }).price ?? null;
          return {
            price: price ? { id: price.id ?? null } : null,
          };
        }),
      },
    })));
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1]?.id;
  }

  return items;
}

function summarizeCreditsRevenue(
  sessions: CreditsRevenueSession[],
  range: { fromMs: number; toMs: number },
): { total: number; byDate: Map<string, number>; error: string | null } {
  const byDate = new Map<string, number>();
  let total = 0;

  for (const session of sessions) {
    if (session.payment_status !== "paid") continue;
    if (!session.metadata?.credit_package) continue;
    if (!Number.isFinite(session.amount_total) || session.amount_total === null) continue;
    const createdMs = toMillis(session.created);
    if (createdMs === null || createdMs < range.fromMs || createdMs >= range.toMs) continue;
    const date_utc = utcDate(createdMs);
    const amountUsd = session.amount_total / 100;
    total += amountUsd;
    byDate.set(date_utc, (byDate.get(date_utc) ?? 0) + amountUsd);
  }

  return { total, byDate, error: null };
}

function summarizeSubscriptionRevenue(
  invoices: SubscriptionRevenueInvoice[],
  proMonthlyPriceId: string,
  range: { fromMs: number; toMs: number },
): { total: number; byDate: Map<string, number>; error: string | null } {
  const byDate = new Map<string, number>();
  let total = 0;

  for (const invoice of invoices) {
    if (!Number.isFinite(invoice.amount_paid) || invoice.amount_paid === null) continue;
    const lines = invoice.lines?.data ?? [];
    if (!lines.some((line) => line.price?.id === proMonthlyPriceId)) continue;
    const createdMs = toMillis(invoice.created);
    if (createdMs === null || createdMs < range.fromMs || createdMs >= range.toMs) continue;
    const date_utc = utcDate(createdMs);
    const amountUsd = invoice.amount_paid / 100;
    total += amountUsd;
    byDate.set(date_utc, (byDate.get(date_utc) ?? 0) + amountUsd);
  }

  return { total, byDate, error: null };
}

function emptyRevenue(
  range: { fromMs: number; toMs: number },
  message: string,
): {
  summary: Pick<AnalyticsSummary, "credits_revenue_usd" | "subscription_revenue_usd" | "gross_revenue_usd">;
  by_day: RevenuePoint[];
  status: RevenueStatus;
} {
  return {
    summary: {
      credits_revenue_usd: 0,
      subscription_revenue_usd: 0,
      gross_revenue_usd: 0,
    },
    by_day: buildDateSeries(range).map((date_utc) => ({
      date_utc,
      credits_revenue_usd: 0,
      subscription_revenue_usd: 0,
      gross_revenue_usd: 0,
    })),
    status: {
      available: false,
      message,
    },
  };
}

function parseWindow(raw: string | null): AnalyticsWindow | Response {
  if (raw === null || raw === "") return "7d";
  if (!VALID_WINDOWS.includes(raw as AnalyticsWindow)) {
    return jsonResponse({ error: "invalid_window" }, { status: 400 });
  }
  return raw as AnalyticsWindow;
}

function rangeForWindow(window: AnalyticsWindow, now: number): { fromMs: number; toMs: number } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  if (window === "today") {
    return { fromMs: start.getTime(), toMs: now };
  }
  const days = window === "7d" ? 7 : 30;
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { fromMs: start.getTime(), toMs: now };
}

function parseLimit(raw: string | null): number | Response {
  if (raw === null || raw === "") return DEFAULT_USER_LIST_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit <= 0) {
    return jsonResponse({ error: "invalid_limit" }, { status: 400 });
  }
  return Math.min(limit, MAX_USER_LIST_LIMIT);
}

function parseCursor(raw: string | null): CursorPayload | null | Response {
  if (raw === null || raw === "") return null;
  try {
    const decoded = JSON.parse(decodeBase64Url(raw)) as CursorPayload;
    if (
      !decoded ||
      !Number.isInteger(decoded.created_at) ||
      typeof decoded.user_id !== "string" ||
      decoded.user_id === ""
    ) {
      throw new Error("invalid");
    }
    return decoded;
  } catch {
    return jsonResponse({ error: "invalid_cursor" }, { status: 400 });
  }
}

function encodeCursor(value: CursorPayload): string {
  return encodeBase64Url(JSON.stringify(value));
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(`${normalized}${padding}`);
}

function normalizeTierBreakdown(rows: Array<{ tier: "free" | "pro"; count: number }>): TierBreakdownItem[] {
  const counts = new Map(rows.map((row) => [row.tier, row.count ?? 0]));
  return [
    { tier: "free", count: counts.get("free") ?? 0 },
    { tier: "pro", count: counts.get("pro") ?? 0 },
  ];
}

function buildDateSeries(range: { fromMs: number; toMs: number }): string[] {
  const dates: string[] = [];
  const cursor = new Date(range.fromMs);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(range.toMs);
  end.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function utcDate(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function toRevenueWindow(range: { fromMs: number; toMs: number }): RevenueWindow {
  const fromSec = Math.floor(range.fromMs / 1000);
  const toSec = Math.max(fromSec, Math.floor((range.toMs - 1) / 1000));
  return { fromSec, toSec };
}

function toMillis(seconds: number | null): number | null {
  return Number.isInteger(seconds) && seconds !== null ? seconds * 1000 : null;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

async function guard(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
