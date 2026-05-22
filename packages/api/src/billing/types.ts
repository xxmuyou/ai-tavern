import type Stripe from "stripe";

export type BillingEnv = Env & {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_SUCCESS_URL?: string;
  STRIPE_CANCEL_URL?: string;
  STRIPE_PORTAL_RETURN_URL?: string;
};

export type BillingTier = "free" | "pro";

export type SubscriptionDto = {
  tier: BillingTier;
  status: string;
  price_id: string | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
};

export type EntitlementsDto = {
  tier: BillingTier;
  message_limit_daily: number | null;
  custom_companion_limit: number | null;
  subscriber_soft_message_threshold_daily: number | null;
};

export type UsageDto = {
  date_utc: string;
  messages_used_today: number;
  message_limit_daily: number | null;
  subscriber_soft_threshold_exceeded: boolean;
};

export type BillingStatusDto = {
  subscription: SubscriptionDto;
  entitlements: EntitlementsDto;
  usage: UsageDto;
};

export type BillingCustomerRow = {
  user_id: string;
  stripe_customer_id: string;
  email: string;
  livemode: number;
  created_at: number;
  updated_at: number;
};

export type BillingSubscriptionRow = {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  status: string;
  price_id: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: number;
  canceled_at: number | null;
  livemode: number;
  raw_json: string;
  created_at: number;
  updated_at: number;
};

export type BillingWebhookEventStatus = "processing" | "processed" | "failed" | "ignored";

export type WebhookStartResult =
  | { action: "process" }
  | { action: "duplicate"; status: BillingWebhookEventStatus };

export type StripeSubscriptionLike = Stripe.Subscription & {
  current_period_start?: number;
  current_period_end?: number;
};
