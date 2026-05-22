import { requireAuthUser } from "../auth";
import { jsonResponse } from "../http";
import { readBillingConfig } from "./config";
import { getBillingStatus } from "./entitlements";
import {
  getBillingCustomer,
  upsertBillingCustomer,
} from "./repository";
import {
  constructWebhookEvent,
  createCheckoutSession,
  createCustomer,
  createCustomerPortalSession,
  createStripeClient,
} from "./stripe";
import type { BillingEnv } from "./types";
import { eventTimeMillis, processStripeWebhookEvent } from "./webhooks";

export async function handleBillingRequest(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  pathname: string,
): Promise<Response | null> {
  if (!pathname.startsWith("/billing")) {
    return null;
  }

  if (pathname === "/billing/checkout") {
    return handleCheckout(request, env as BillingEnv);
  }

  if (pathname === "/billing/portal") {
    return handlePortal(request, env as BillingEnv);
  }

  if (pathname === "/billing/status") {
    return handleStatus(request, env);
  }

  if (pathname === "/billing/webhook") {
    return handleWebhook(request, env as BillingEnv);
  }

  return jsonResponse({ error: "not_found" }, { status: 404 });
}

async function handleCheckout(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const user = await requireAuthUser(env, request);
  const config = readBillingConfig(env, "checkout");
  const stripe = createStripeClient(config);
  const now = Date.now();

  try {
    let customer = await getBillingCustomer(env, user.id);
    if (!customer) {
      const stripeCustomer = await createCustomer(stripe, { email: user.email, userId: user.id });
      await upsertBillingCustomer(env, {
        email: user.email,
        livemode: Boolean(stripeCustomer.livemode),
        now,
        stripeCustomerId: stripeCustomer.id,
        userId: user.id,
      });
      customer = {
        created_at: now,
        email: user.email,
        livemode: stripeCustomer.livemode ? 1 : 0,
        stripe_customer_id: stripeCustomer.id,
        updated_at: now,
        user_id: user.id,
      };
    }

    const session = await createCheckoutSession(stripe, {
      cancelUrl: config.cancelUrl,
      customerId: customer.stripe_customer_id,
      priceId: config.priceProMonthly,
      successUrl: config.successUrl,
      userId: user.id,
    });

    if (!session.url) {
      return jsonResponse({ error: "stripe_error" }, { status: 502 });
    }

    return jsonResponse({ checkout_url: session.url });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(JSON.stringify({ error: String(err), message: "Stripe checkout failed" }));
    return jsonResponse({ error: "stripe_error" }, { status: 502 });
  }
}

async function handlePortal(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const user = await requireAuthUser(env, request);
  const config = readBillingConfig(env, "portal");
  const customer = await getBillingCustomer(env, user.id);
  if (!customer) {
    return jsonResponse({ error: "billing_customer_not_found" }, { status: 404 });
  }

  try {
    const stripe = createStripeClient(config);
    const session = await createCustomerPortalSession(stripe, {
      customerId: customer.stripe_customer_id,
      returnUrl: config.portalReturnUrl,
    });
    return jsonResponse({ portal_url: session.url });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(JSON.stringify({ error: String(err), message: "Stripe portal failed" }));
    return jsonResponse({ error: "stripe_error" }, { status: 502 });
  }
}

async function handleStatus(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const user = await requireAuthUser(env, request);
  return jsonResponse(await getBillingStatus(env, user.id));
}

async function handleWebhook(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, { status: 405 });
  }

  const config = readBillingConfig(env, "webhook");
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse({ error: "stripe_signature_invalid" }, { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = createStripeClient(config);

  try {
    const event = await constructWebhookEvent(stripe, rawBody, signature, config.webhookSecret);
    const result = await processStripeWebhookEvent(env, stripe, event, eventTimeMillis(event));
    return jsonResponse(result.duplicate ? { duplicate: true, ok: true } : { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("signature") || message.toLowerCase().includes("webhook")) {
      return jsonResponse({ error: "stripe_signature_invalid" }, { status: 400 });
    }
    if (message.toLowerCase().includes("json")) {
      return jsonResponse({ error: "stripe_event_invalid" }, { status: 400 });
    }
    console.error(JSON.stringify({ error: String(err), message: "Stripe webhook failed" }));
    return jsonResponse({ error: "stripe_error" }, { status: 500 });
  }
}

export { getBillingStatus, isProUser } from "./entitlements";
export {
  checkMessageQuota,
  checkRateLimit,
  formatDateUtc,
  incrementMessageQuota,
  messageQuotaKey,
  minuteKey,
  QUOTA_LIMITS,
} from "./quota";
