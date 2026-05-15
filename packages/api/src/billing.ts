import { jsonResponse, readJson } from "./http";
import {
  ensureUserByEmail,
  findUserById,
  normalizeAppKey,
  normalizeEmail,
  PLATFORM_APP_KEY,
  type UserRecord,
} from "./identity";

type BillingEnv = Env & {
  STRIPE_CANCEL_URL?: string;
  STRIPE_PORTAL_RETURN_URL?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_SUCCESS_URL?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

type CheckoutRequest = {
  appKey?: string;
  email?: string;
};

type PortalRequest = {
  appKey?: string;
  email?: string;
};

type StripeObject = Record<string, unknown>;

type SubscriptionInput = {
  appKey?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string;
  customerId: string;
  email?: string;
  priceId?: string;
  sourceAppKey?: string;
  status: string;
  subscriptionId: string;
  userId?: string;
};

type SubscriptionRow = {
  cancel_at_period_end: number;
  current_period_end: string | null;
  price_id: string | null;
  status: string;
  stripe_subscription_id: string;
};

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const WEBHOOK_TOLERANCE_SECONDS = 300;

export async function handleBillingRequest(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response | null> {
  const billingEnv = env as BillingEnv;
  const url = new URL(request.url);

  if (pathname === "/billing/config" && request.method === "GET") {
    return jsonResponse({
      appKey: PLATFORM_APP_KEY,
      publishableKey: billingEnv.STRIPE_PUBLISHABLE_KEY ?? "",
      priceId: billingEnv.STRIPE_PRICE_PRO_MONTHLY ?? "",
      mode: billingEnv.APP_ENV,
    });
  }

  if (pathname === "/billing/subscription" && request.method === "GET") {
    const email = normalizeEmail(url.searchParams.get("email"));

    if (!email) {
      return jsonResponse({ active: false, status: "missing_email" }, { status: 400 });
    }

    const user = await ensureUserByEmail(billingEnv, email);
    return jsonResponse(await getSubscriptionStatus(billingEnv, user));
  }

  if (pathname === "/billing/checkout" && request.method === "POST") {
    const body = await readJson<CheckoutRequest>(request);
    return createCheckoutSession(request, billingEnv, body);
  }

  if (pathname === "/billing/portal" && request.method === "POST") {
    const body = await readJson<PortalRequest>(request);
    return createPortalSession(request, billingEnv, body);
  }

  if (pathname === "/billing/stripe/webhook" && request.method === "POST") {
    return handleStripeWebhook(request, billingEnv);
  }

  return null;
}

async function createCheckoutSession(
  request: Request,
  env: BillingEnv,
  body: CheckoutRequest,
): Promise<Response> {
  const stripeSecretKey = requireStripeSecret(env);
  const priceId = requireConfig(env.STRIPE_PRICE_PRO_MONTHLY, "STRIPE_PRICE_PRO_MONTHLY");
  const sourceAppKey = normalizeAppKey(body.appKey);
  const email = normalizeEmail(body.email);

  if (!email) {
    return jsonResponse({ error: "email_required" }, { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const origin = new URL(request.url).origin;
  const successUrl = env.STRIPE_SUCCESS_URL || `${origin}/?billing=success`;
  const cancelUrl = env.STRIPE_CANCEL_URL || `${origin}/?billing=cancelled`;
  const params = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: user.id,
    customer_email: user.email,
    "metadata[app_key]": PLATFORM_APP_KEY,
    "metadata[email]": user.email,
    "metadata[source_app_key]": sourceAppKey,
    "metadata[user_id]": user.id,
    "subscription_data[metadata][app_key]": PLATFORM_APP_KEY,
    "subscription_data[metadata][email]": user.email,
    "subscription_data[metadata][source_app_key]": sourceAppKey,
    "subscription_data[metadata][user_id]": user.id,
    "allow_promotion_codes": "true",
  });

  const session = await stripeRequest<StripeObject>(
    stripeSecretKey,
    "/checkout/sessions",
    params,
  );
  const checkoutUrl = asString(session.url);

  if (!checkoutUrl) {
    return jsonResponse({ error: "stripe_checkout_url_missing" }, { status: 502 });
  }

  return jsonResponse({ url: checkoutUrl, userId: user.id });
}

async function createPortalSession(
  request: Request,
  env: BillingEnv,
  body: PortalRequest,
): Promise<Response> {
  const stripeSecretKey = requireStripeSecret(env);
  const email = normalizeEmail(body.email);

  if (!email) {
    return jsonResponse({ error: "email_required" }, { status: 400 });
  }

  const user = await ensureUserByEmail(env, email);
  const customer = await env.DB.prepare(
    `SELECT stripe_customer_id
     FROM stripe_customers
     WHERE app_key = ? AND (user_id = ? OR email = ?)
     ORDER BY user_id IS NULL ASC, updated_at DESC
     LIMIT 1`,
  )
    .bind(PLATFORM_APP_KEY, user.id, user.email)
    .first<{ stripe_customer_id: string }>();

  if (!customer) {
    return jsonResponse({ error: "customer_not_found" }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const returnUrl = env.STRIPE_PORTAL_RETURN_URL || `${origin}/?billing=portal`;
  const session = await stripeRequest<StripeObject>(
    stripeSecretKey,
    "/billing_portal/sessions",
    new URLSearchParams({
      customer: customer.stripe_customer_id,
      return_url: returnUrl,
    }),
  );
  const portalUrl = asString(session.url);

  if (!portalUrl) {
    return jsonResponse({ error: "stripe_portal_url_missing" }, { status: 502 });
  }

  return jsonResponse({ url: portalUrl });
}

async function handleStripeWebhook(request: Request, env: BillingEnv): Promise<Response> {
  const webhookSecret = requireConfig(env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET");
  const signature = request.headers.get("stripe-signature");
  const bodyText = await request.text();

  if (!signature || !(await verifyStripeSignature(bodyText, signature, webhookSecret))) {
    return jsonResponse({ error: "invalid_signature" }, { status: 400 });
  }

  const event = JSON.parse(bodyText) as StripeObject;
  const eventId = asString(event.id);
  const eventType = asString(event.type);

  if (!eventId || !eventType) {
    return jsonResponse({ error: "invalid_event" }, { status: 400 });
  }

  const existing = await env.DB.prepare(
    "SELECT stripe_event_id FROM stripe_webhook_events WHERE stripe_event_id = ?",
  )
    .bind(eventId)
    .first();

  if (existing) {
    return jsonResponse({ received: true, duplicate: true });
  }

  await processStripeEvent(env, eventType, getEventObject(event));
  await env.DB.prepare(
    "INSERT INTO stripe_webhook_events (stripe_event_id, event_type) VALUES (?, ?)",
  )
    .bind(eventId, eventType)
    .run();

  return jsonResponse({ received: true });
}

async function processStripeEvent(
  env: BillingEnv,
  eventType: string,
  object: StripeObject,
): Promise<void> {
  if (eventType === "checkout.session.completed") {
    const customerId = asString(object.customer);
    const subscriptionId = asString(object.subscription);
    const email = normalizeEmail(asString(object.customer_email) || getCustomerDetailsEmail(object));
    const user = await resolveStripeUser(env, object, email);

    if (customerId && user) {
      await upsertCustomer(env, {
        customerId,
        email: user.email,
        sourceAppKey: normalizeAppKey(asMetadataString(object, "source_app_key")),
        userId: user.id,
      });
    }

    if (customerId && subscriptionId) {
      await upsertSubscription(env, {
        customerId,
        subscriptionId,
        email: user?.email ?? email,
        sourceAppKey: normalizeAppKey(asMetadataString(object, "source_app_key")),
        status: "checkout_completed",
        userId: user?.id,
      });
    }
  }

  if (eventType.startsWith("customer.subscription.")) {
    await upsertSubscription(env, subscriptionFromStripeObject(object));
  }

  if (eventType.startsWith("invoice.payment_")) {
    const subscriptionId = asString(object.subscription);
    const customerId = asString(object.customer);
    const email = normalizeEmail(asString(object.customer_email));
    const user = await resolveStripeUser(env, object, email);

    if (subscriptionId && customerId) {
      await upsertSubscription(env, {
        customerId,
        subscriptionId,
        email: user?.email ?? email,
        sourceAppKey: normalizeAppKey(asMetadataString(object, "source_app_key")),
        status: eventType === "invoice.payment_succeeded" ? "active" : "past_due",
        userId: user?.id,
      });
    }
  }
}

async function resolveStripeUser(
  env: BillingEnv,
  object: StripeObject,
  fallbackEmail: string | undefined,
): Promise<UserRecord | null> {
  const userId = asMetadataString(object, "user_id");

  if (userId) {
    const existing = await findUserById(env, userId);
    if (existing) {
      return existing;
    }
  }

  const email = normalizeEmail(asMetadataString(object, "email")) ?? fallbackEmail;
  return email ? ensureUserByEmail(env, email, userId) : null;
}

async function upsertCustomer(
  env: BillingEnv,
  input: {
    customerId: string;
    email: string;
    sourceAppKey: string;
    userId: string;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO stripe_customers (
       app_key,
       email,
       stripe_customer_id,
       user_id,
       source_app_key,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(app_key, email) DO UPDATE SET
       stripe_customer_id = excluded.stripe_customer_id,
       user_id = excluded.user_id,
       source_app_key = excluded.source_app_key,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      PLATFORM_APP_KEY,
      input.email,
      input.customerId,
      input.userId,
      input.sourceAppKey,
    )
    .run();
}

async function upsertSubscription(
  env: BillingEnv,
  input: SubscriptionInput,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO stripe_subscriptions (
       app_key,
       stripe_subscription_id,
       stripe_customer_id,
       user_id,
       email,
       status,
       price_id,
       current_period_end,
       cancel_at_period_end,
       source_app_key,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(stripe_subscription_id) DO UPDATE SET
       app_key = excluded.app_key,
       stripe_customer_id = excluded.stripe_customer_id,
       user_id = COALESCE(excluded.user_id, stripe_subscriptions.user_id),
       email = COALESCE(excluded.email, stripe_subscriptions.email),
       status = excluded.status,
       price_id = COALESCE(excluded.price_id, stripe_subscriptions.price_id),
       current_period_end = COALESCE(excluded.current_period_end, stripe_subscriptions.current_period_end),
       cancel_at_period_end = excluded.cancel_at_period_end,
       source_app_key = COALESCE(excluded.source_app_key, stripe_subscriptions.source_app_key),
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      input.appKey ?? PLATFORM_APP_KEY,
      input.subscriptionId,
      input.customerId,
      input.userId ?? null,
      input.email ?? null,
      input.status,
      input.priceId ?? null,
      input.currentPeriodEnd ?? null,
      input.cancelAtPeriodEnd ? 1 : 0,
      input.sourceAppKey ?? null,
    )
    .run();
}

async function getSubscriptionStatus(
  env: BillingEnv,
  user: UserRecord,
): Promise<Record<string, unknown>> {
  const subscription = await env.DB.prepare(
    `SELECT stripe_subscription_id, status, price_id, current_period_end, cancel_at_period_end
     FROM stripe_subscriptions
     WHERE app_key = ? AND (user_id = ? OR email = ?)
     ORDER BY updated_at DESC
     LIMIT 1`,
  )
    .bind(PLATFORM_APP_KEY, user.id, user.email)
    .first<SubscriptionRow>();

  if (!subscription) {
    return {
      active: false,
      appKey: PLATFORM_APP_KEY,
      status: "none",
      user: { email: user.email, id: user.id },
    };
  }

  const refreshed = await maybeRefreshSubscriptionPeriod(env, subscription);

  return {
    active: ["active", "trialing", "checkout_completed"].includes(refreshed.status),
    appKey: PLATFORM_APP_KEY,
    status: refreshed.status,
    priceId: refreshed.price_id,
    currentPeriodEnd: refreshed.current_period_end,
    cancelAtPeriodEnd: refreshed.cancel_at_period_end === 1,
    user: { email: user.email, id: user.id },
  };
}

async function stripeRequest<T>(
  secretKey: string,
  path: string,
  body: URLSearchParams,
): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await response.json()) as T & { error?: { message?: string } };

  if (!response.ok) {
    throw new Response(data.error?.message ?? "Stripe request failed", { status: 502 });
  }

  return data;
}

async function stripeGet<T>(secretKey: string, path: string): Promise<T> {
  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    headers: {
      authorization: `Bearer ${secretKey}`,
    },
  });
  const data = (await response.json()) as T & { error?: { message?: string } };

  if (!response.ok) {
    throw new Response(data.error?.message ?? "Stripe request failed", { status: 502 });
  }

  return data;
}

async function maybeRefreshSubscriptionPeriod(
  env: BillingEnv,
  subscription: SubscriptionRow,
) {
  if (
    subscription.current_period_end ||
    !env.STRIPE_SECRET_KEY ||
    !["active", "trialing", "checkout_completed"].includes(subscription.status)
  ) {
    return subscription;
  }

  const stripeSubscription = await stripeGet<StripeObject>(
    env.STRIPE_SECRET_KEY,
    `/subscriptions/${encodeURIComponent(subscription.stripe_subscription_id)}`,
  );
  const parsed = subscriptionFromStripeObject(stripeSubscription);

  await upsertSubscription(env, parsed);

  return {
    ...subscription,
    cancel_at_period_end: parsed.cancelAtPeriodEnd ? 1 : 0,
    current_period_end: parsed.currentPeriodEnd ?? subscription.current_period_end,
    price_id: parsed.priceId ?? subscription.price_id,
    status: parsed.status,
  };
}

async function verifyStripeSignature(
  body: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const timestamp = parseStripeSignaturePart(signatureHeader, "t");
  const expected = parseStripeSignaturePart(signatureHeader, "v1");

  if (!timestamp || !expected) {
    return false;
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const actual = toHex(signature);

  return timingSafeEqual(actual, expected);
}

function subscriptionFromStripeObject(object: StripeObject): SubscriptionInput {
  const customerId = requireString(asString(object.customer), "stripe_customer_id");
  const subscriptionId = requireString(asString(object.id), "stripe_subscription_id");
  const status = asString(object.status) || "unknown";
  const email = normalizeEmail(asMetadataString(object, "email"));
  const cancelAtPeriodEnd = object.cancel_at_period_end === true;
  const items = object.items as { data?: Array<StripeObject> } | undefined;
  const price = items?.data?.[0]?.price as StripeObject | undefined;
  const currentPeriodEnd = unixToIso(
    asNumber(object.current_period_end) ?? asNumber(items?.data?.[0]?.current_period_end),
  );

  return {
    appKey: PLATFORM_APP_KEY,
    customerId,
    subscriptionId,
    email,
    sourceAppKey: normalizeAppKey(asMetadataString(object, "source_app_key")),
    status,
    userId: asMetadataString(object, "user_id"),
    priceId: asString(price?.id),
    currentPeriodEnd,
    cancelAtPeriodEnd,
  };
}

function getEventObject(event: StripeObject): StripeObject {
  const data = event.data as { object?: StripeObject } | undefined;
  return data?.object ?? {};
}

function getCustomerDetailsEmail(object: StripeObject): string | undefined {
  const details = object.customer_details as { email?: string } | undefined;
  return details?.email;
}

function asMetadataString(object: StripeObject, key: string): string | undefined {
  const metadata = object.metadata as Record<string, unknown> | undefined;
  return asString(metadata?.[key]);
}

function requireStripeSecret(env: BillingEnv): string {
  return requireConfig(env.STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
}

function requireConfig(value: string | undefined, name: string): string {
  if (!value) {
    throw new Response(`${name} is not configured`, { status: 500 });
  }

  return value;
}

function requireString(value: string | undefined, name: string): string {
  if (!value) {
    throw new Response(`${name} missing from Stripe event`, { status: 400 });
  }

  return value;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function unixToIso(value: number | undefined): string | undefined {
  return value ? new Date(value * 1000).toISOString() : undefined;
}

function parseStripeSignaturePart(header: string, key: string): string | undefined {
  return header
    .split(",")
    .map((part) => part.split("="))
    .find(([partKey]) => partKey === key)
    ?.[1];
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}
