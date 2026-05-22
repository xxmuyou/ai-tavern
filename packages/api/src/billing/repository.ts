import type Stripe from "stripe";
import type {
  BillingCustomerRow,
  BillingSubscriptionRow,
  BillingWebhookEventStatus,
  StripeSubscriptionLike,
  WebhookStartResult,
} from "./types";

type SubscriptionPeriod = {
  priceId: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
};

export async function getBillingCustomer(env: Env, userId: string): Promise<BillingCustomerRow | null> {
  return env.DB.prepare(
    `SELECT user_id, stripe_customer_id, email, livemode, created_at, updated_at
     FROM billing_customers WHERE user_id = ?`,
  )
    .bind(userId)
    .first<BillingCustomerRow>();
}

export async function getBillingCustomerByStripeId(
  env: Env,
  stripeCustomerId: string,
): Promise<BillingCustomerRow | null> {
  return env.DB.prepare(
    `SELECT user_id, stripe_customer_id, email, livemode, created_at, updated_at
     FROM billing_customers WHERE stripe_customer_id = ?`,
  )
    .bind(stripeCustomerId)
    .first<BillingCustomerRow>();
}

export async function upsertBillingCustomer(
  env: Env,
  input: {
    email: string;
    livemode: boolean;
    now: number;
    stripeCustomerId: string;
    userId: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO billing_customers
       (user_id, stripe_customer_id, email, livemode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       stripe_customer_id = excluded.stripe_customer_id,
       email = excluded.email,
       livemode = excluded.livemode,
       updated_at = excluded.updated_at`,
  )
    .bind(input.userId, input.stripeCustomerId, input.email, input.livemode ? 1 : 0, input.now, input.now)
    .run();
}

export async function getActiveSubscriptionForUser(
  env: Env,
  userId: string,
  now: number,
): Promise<BillingSubscriptionRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, stripe_customer_id, status, price_id, current_period_start,
            current_period_end, cancel_at_period_end, canceled_at, livemode,
            raw_json, created_at, updated_at
     FROM billing_subscriptions
     WHERE user_id = ?
       AND status IN ('active', 'trialing')
       AND current_period_end > ?
     ORDER BY current_period_end DESC
     LIMIT 1`,
  )
    .bind(userId, now)
    .first<BillingSubscriptionRow>();
}

export async function getLatestSubscriptionForUser(
  env: Env,
  userId: string,
): Promise<BillingSubscriptionRow | null> {
  return env.DB.prepare(
    `SELECT id, user_id, stripe_customer_id, status, price_id, current_period_start,
            current_period_end, cancel_at_period_end, canceled_at, livemode,
            raw_json, created_at, updated_at
     FROM billing_subscriptions
     WHERE user_id = ?
     ORDER BY current_period_end DESC
     LIMIT 1`,
  )
    .bind(userId)
    .first<BillingSubscriptionRow>();
}

export async function upsertSubscriptionFromStripe(
  env: Env,
  subscription: StripeSubscriptionLike,
  userId: string,
  now: number,
): Promise<void> {
  const customerId = stripeId(subscription.customer);
  if (!customerId) {
    throw new Error("subscription_customer_missing");
  }

  const period = readSubscriptionPeriod(subscription);
  await env.DB.prepare(
    `INSERT INTO billing_subscriptions
       (id, user_id, stripe_customer_id, status, price_id, current_period_start,
        current_period_end, cancel_at_period_end, canceled_at, livemode,
        raw_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       stripe_customer_id = excluded.stripe_customer_id,
       status = excluded.status,
       price_id = excluded.price_id,
       current_period_start = excluded.current_period_start,
       current_period_end = excluded.current_period_end,
       cancel_at_period_end = excluded.cancel_at_period_end,
       canceled_at = excluded.canceled_at,
       livemode = excluded.livemode,
       raw_json = excluded.raw_json,
       updated_at = excluded.updated_at`,
  )
    .bind(
      subscription.id,
      userId,
      customerId,
      subscription.status,
      period.priceId,
      period.currentPeriodStart,
      period.currentPeriodEnd,
      subscription.cancel_at_period_end ? 1 : 0,
      secondsToMillis(subscription.canceled_at),
      subscription.livemode ? 1 : 0,
      JSON.stringify(subscription),
      now,
      now,
    )
    .run();
}

export async function beginWebhookEvent(
  env: Env,
  event: Pick<Stripe.Event, "id" | "type" | "livemode">,
  now: number,
): Promise<WebhookStartResult> {
  const existing = await env.DB.prepare("SELECT status FROM billing_webhook_events WHERE id = ?")
    .bind(event.id)
    .first<{ status: BillingWebhookEventStatus }>();

  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO billing_webhook_events
         (id, type, livemode, status, error, received_at, processed_at)
       VALUES (?, ?, ?, 'processing', NULL, ?, NULL)`,
    )
      .bind(event.id, event.type, event.livemode ? 1 : 0, now)
      .run();
    return { action: "process" };
  }

  if (existing.status === "failed") {
    await env.DB.prepare(
      `UPDATE billing_webhook_events
       SET status = 'processing', error = NULL, processed_at = NULL
       WHERE id = ? AND status = 'failed'`,
    )
      .bind(event.id)
      .run();
    return { action: "process" };
  }

  return { action: "duplicate", status: existing.status };
}

export async function finishWebhookEvent(
  env: Env,
  eventId: string,
  status: Exclude<BillingWebhookEventStatus, "processing">,
  now: number,
  error?: string,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE billing_webhook_events
     SET status = ?, error = ?, processed_at = ?
     WHERE id = ?`,
  )
    .bind(status, error ?? null, now, eventId)
    .run();
}

export function stripeId(value: string | { id?: string } | null | undefined): string | null {
  if (typeof value === "string") return value;
  return typeof value?.id === "string" ? value.id : null;
}

export function secondsToMillis(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value * 1000 : null;
}

export function readSubscriptionUserId(subscription: Stripe.Subscription): string | null {
  const value = subscription.metadata?.user_id;
  return value && typeof value === "string" ? value : null;
}

function readSubscriptionPeriod(subscription: StripeSubscriptionLike): SubscriptionPeriod {
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id;
  if (!priceId) {
    throw new Error("subscription_price_missing");
  }

  const start = subscription.current_period_start ?? item.current_period_start;
  const end = subscription.current_period_end ?? item.current_period_end;
  if (!start || !end) {
    throw new Error("subscription_period_missing");
  }

  return {
    currentPeriodEnd: start > 10_000_000_000 ? end : end * 1000,
    currentPeriodStart: start > 10_000_000_000 ? start : start * 1000,
    priceId,
  };
}
