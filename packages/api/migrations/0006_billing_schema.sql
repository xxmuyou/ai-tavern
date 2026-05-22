-- spec-010: Stripe Billing + Entitlements + Quota
-- Prod has not launched yet; replace the spec-003 placeholder table instead of
-- preserving a legacy entitlement source.

DROP TABLE IF EXISTS subscriptions;

CREATE TABLE billing_customers (
  user_id            TEXT PRIMARY KEY REFERENCES users(id),
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email              TEXT NOT NULL,
  livemode           INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE TABLE billing_subscriptions (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id),
  stripe_customer_id   TEXT NOT NULL,
  status               TEXT NOT NULL,
  price_id             TEXT NOT NULL,
  current_period_start INTEGER NOT NULL,
  current_period_end   INTEGER NOT NULL,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  canceled_at          INTEGER,
  livemode             INTEGER NOT NULL DEFAULT 0,
  raw_json             TEXT NOT NULL,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE TABLE billing_webhook_events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  livemode     INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL,
  error        TEXT,
  received_at  INTEGER NOT NULL,
  processed_at INTEGER
);

CREATE INDEX idx_billing_customers_stripe ON billing_customers(stripe_customer_id);
CREATE INDEX idx_billing_subscriptions_user ON billing_subscriptions(user_id);
CREATE INDEX idx_billing_subscriptions_customer ON billing_subscriptions(stripe_customer_id);
CREATE INDEX idx_billing_subscriptions_status ON billing_subscriptions(status);
CREATE INDEX idx_billing_subscriptions_period_end ON billing_subscriptions(current_period_end);
CREATE INDEX idx_billing_webhook_events_type ON billing_webhook_events(type);

-- ROLLBACK:
-- DROP TABLE IF EXISTS billing_webhook_events;
-- DROP TABLE IF EXISTS billing_subscriptions;
-- DROP TABLE IF EXISTS billing_customers;
