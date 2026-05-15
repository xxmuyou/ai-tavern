CREATE TABLE IF NOT EXISTS stripe_customers (
  app_key TEXT NOT NULL,
  email TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (app_key, email)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stripe_customers_customer_id
ON stripe_customers (stripe_customer_id);

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  app_key TEXT NOT NULL,
  stripe_subscription_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL,
  price_id TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_app_email
ON stripe_subscriptions (app_key, email);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
