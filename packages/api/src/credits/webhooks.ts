import type Stripe from "stripe";
import { analyticsContextFromStripeMetadata } from "../analytics/attribution";
import { recordAnalyticsEvent } from "../analytics/events";
import { stripeId } from "../billing/repository";
import { recordPurchase } from "./ledger";
import { CREDIT_PACKAGES, isCreditPackageId } from "./pricing";

export function isCreditsCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return typeof session.metadata?.credit_package === "string";
}

/**
 * Credits checkout sessions are created with `mode: "payment"` and carry
 * `credit_package` metadata. Idempotency is enforced both at the event level
 * (billing_webhook_events) and the ledger level (unique stripe_session
 * reference), so a redelivered webhook never double-credits. See spec-021 §D.
 */
export async function handleCreditsCheckoutCompleted(
  env: Env,
  session: Stripe.Checkout.Session,
  now: number,
): Promise<boolean> {
  const packageId = session.metadata?.credit_package;
  if (!isCreditPackageId(packageId)) {
    return false;
  }

  const userId = session.client_reference_id ?? session.metadata?.user_id ?? null;
  if (!userId || !session.id) {
    return false;
  }

  const credits = resolveCredits(session, packageId);
  if (credits <= 0) {
    return false;
  }

  await recordPurchase(env, {
    credits,
    now,
    packageId,
    paymentId: stripeId(session.payment_intent ?? null),
    sessionId: session.id,
    userId,
  });
  await recordCreditsAnalytics(env, session, {
    credits,
    now,
    packageId,
    userId,
  });
  return true;
}

function resolveCredits(session: Stripe.Checkout.Session, packageId: keyof typeof CREDIT_PACKAGES): number {
  const fromMetadata = Number(session.metadata?.credits ?? "");
  if (Number.isInteger(fromMetadata) && fromMetadata > 0) {
    return fromMetadata;
  }
  return CREDIT_PACKAGES[packageId].credits;
}

async function recordCreditsAnalytics(
  env: Env,
  session: Stripe.Checkout.Session,
  input: {
    credits: number;
    now: number;
    packageId: keyof typeof CREDIT_PACKAGES;
    userId: string;
  },
): Promise<void> {
  const attribution = analyticsContextFromStripeMetadata(session.metadata);
  const common = compactProperties({
    amount_total: session.amount_total ?? null,
    checkout_type: "credits",
    credit_package_id: input.packageId,
    credits: input.credits,
    currency: session.currency ?? null,
    livemode: session.livemode ?? null,
    payment_status: session.payment_status ?? null,
    stripe_session_id: session.id,
  });

  try {
    await recordAnalyticsEvent(env, {
      attribution,
      eventName: "billing_checkout_completed",
      occurredAt: secondsToMillis(session.created) ?? input.now,
      properties: common,
      userId: input.userId,
    });
    await recordAnalyticsEvent(env, {
      attribution,
      eventName: "credits_purchased",
      occurredAt: secondsToMillis(session.created) ?? input.now,
      properties: common,
      userId: input.userId,
    });
  } catch (error) {
    console.error(JSON.stringify({ error: String(error), message: "Credits analytics write failed" }));
  }
}

function secondsToMillis(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value * 1000 : null;
}

function compactProperties(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined));
}
