import type Stripe from "stripe";
import {
  beginWebhookEvent,
  finishWebhookEvent,
  getBillingCustomerByStripeId,
  readSubscriptionUserId,
  secondsToMillis,
  stripeId,
  upsertBillingCustomer,
  upsertSubscriptionFromStripe,
} from "./repository";
import { retrieveSubscription } from "./stripe";
import type { BillingEnv, StripeSubscriptionLike } from "./types";

export async function processStripeWebhookEvent(
  env: BillingEnv,
  stripe: Stripe,
  event: Stripe.Event,
  now = Date.now(),
): Promise<{ duplicate: boolean }> {
  const start = await beginWebhookEvent(env, event, now);
  if (start.action === "duplicate") {
    return { duplicate: true };
  }

  try {
    const processed = await dispatchWebhookEvent(env, stripe, event, now);
    await finishWebhookEvent(env, event.id, processed ? "processed" : "ignored", Date.now());
    return { duplicate: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishWebhookEvent(env, event.id, "failed", Date.now(), message);
    throw err;
  }
}

async function dispatchWebhookEvent(
  env: BillingEnv,
  stripe: Stripe,
  event: Stripe.Event,
  now: number,
): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(env, stripe, event.data.object as Stripe.Checkout.Session, now, event.livemode);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return handleSubscription(env, event.data.object as StripeSubscriptionLike, now);
    case "invoice.payment_succeeded":
    case "invoice.payment_failed":
      return handleInvoice(env, stripe, event.data.object as Stripe.Invoice, now);
    default:
      return false;
  }
}

async function handleCheckoutCompleted(
  env: BillingEnv,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  now: number,
  livemode: boolean,
): Promise<boolean> {
  const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
  const customerId = stripeId(session.customer);
  if (!userId || !customerId) {
    return false;
  }

  const email = session.customer_details?.email ?? "";
  await upsertBillingCustomer(env, {
    email,
    livemode,
    now,
    stripeCustomerId: customerId,
    userId,
  });

  const subscriptionId = stripeId(session.subscription);
  if (subscriptionId) {
    const subscription = await retrieveSubscription(stripe, subscriptionId);
    await upsertSubscriptionFromStripe(env, subscription, userId, now);
  }

  return true;
}

async function handleSubscription(
  env: BillingEnv,
  subscription: StripeSubscriptionLike,
  now: number,
): Promise<boolean> {
  const userId = await resolveUserIdForSubscription(env, subscription);
  if (!userId) {
    return false;
  }
  await upsertSubscriptionFromStripe(env, subscription, userId, now);
  return true;
}

async function handleInvoice(
  env: BillingEnv,
  stripe: Stripe,
  invoice: Stripe.Invoice,
  now: number,
): Promise<boolean> {
  const subscriptionId = readInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    return false;
  }

  const subscription = await retrieveSubscription(stripe, subscriptionId);
  return handleSubscription(env, subscription, now);
}

async function resolveUserIdForSubscription(env: Env, subscription: Stripe.Subscription): Promise<string | null> {
  const metadataUserId = readSubscriptionUserId(subscription);
  if (metadataUserId) {
    return metadataUserId;
  }

  const customerId = stripeId(subscription.customer);
  if (!customerId) {
    return null;
  }

  const customer = await getBillingCustomerByStripeId(env, customerId);
  return customer?.user_id ?? null;
}

function readInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = stripeId((invoice as unknown as { subscription?: string | { id?: string } | null }).subscription);
  if (direct) {
    return direct;
  }

  const parent = (invoice as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
  }).parent;
  return stripeId(parent?.subscription_details?.subscription);
}

export function eventTimeMillis(event: Stripe.Event): number {
  return secondsToMillis(event.created) ?? Date.now();
}
