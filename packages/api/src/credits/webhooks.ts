import type Stripe from "stripe";
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
  return true;
}

function resolveCredits(session: Stripe.Checkout.Session, packageId: keyof typeof CREDIT_PACKAGES): number {
  const fromMetadata = Number(session.metadata?.credits ?? "");
  if (Number.isInteger(fromMetadata) && fromMetadata > 0) {
    return fromMetadata;
  }
  return CREDIT_PACKAGES[packageId].credits;
}
