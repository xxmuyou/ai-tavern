import Stripe from "stripe";
import type { BillingConfig } from "./config";
import type { StripeSubscriptionLike } from "./types";

export function createStripeClient(config: Pick<BillingConfig, "secretKey">): Stripe {
  return new Stripe(config.secretKey, {
    apiVersion: "2026-04-22.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export async function createCheckoutSession(
  stripe: Stripe,
  input: {
    cancelUrl: string;
    customerId: string;
    priceId: string;
    successUrl: string;
    userId: string;
  },
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    customer: input.customerId,
    line_items: [{ price: input.priceId, quantity: 1 }],
    metadata: { user_id: input.userId },
    mode: "subscription",
    subscription_data: { metadata: { user_id: input.userId } },
    success_url: input.successUrl,
  });
}

export async function createCustomerPortalSession(
  stripe: Stripe,
  input: { customerId: string; returnUrl: string },
): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
}

export async function createCustomer(
  stripe: Stripe,
  input: { email: string; userId: string },
): Promise<Stripe.Customer> {
  return stripe.customers.create({
    email: input.email,
    metadata: { user_id: input.userId },
  });
}

export async function retrieveSubscription(
  stripe: Stripe,
  subscriptionId: string,
): Promise<StripeSubscriptionLike> {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  }) as Promise<StripeSubscriptionLike>;
}

export async function constructWebhookEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string,
  webhookSecret: string,
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
}
