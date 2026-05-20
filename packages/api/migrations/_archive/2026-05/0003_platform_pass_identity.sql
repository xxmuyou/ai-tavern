CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS apps (
  app_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'retired')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO apps (app_key, name, status, sort_order) VALUES
  ('sample-focus', 'Sample Focus App', 'active', 10),
  ('sample-arcade', 'Sample Arcade App', 'hidden', 20);

INSERT OR IGNORE INTO users (id, email)
SELECT lower(hex(randomblob(16))), email
FROM stripe_customers
WHERE email IS NOT NULL;

INSERT OR IGNORE INTO users (id, email)
SELECT lower(hex(randomblob(16))), email
FROM stripe_subscriptions
WHERE email IS NOT NULL;

ALTER TABLE stripe_customers ADD COLUMN user_id TEXT;
ALTER TABLE stripe_customers ADD COLUMN source_app_key TEXT;

ALTER TABLE stripe_subscriptions ADD COLUMN user_id TEXT;
ALTER TABLE stripe_subscriptions ADD COLUMN source_app_key TEXT;

UPDATE stripe_customers
SET
  user_id = (SELECT users.id FROM users WHERE users.email = stripe_customers.email),
  source_app_key = app_key,
  app_key = 'platform'
WHERE user_id IS NULL;

UPDATE stripe_subscriptions
SET
  user_id = (SELECT users.id FROM users WHERE users.email = stripe_subscriptions.email),
  source_app_key = app_key,
  app_key = 'platform'
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id
ON stripe_customers (user_id);

CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_platform_user
ON stripe_subscriptions (app_key, user_id);

CREATE INDEX IF NOT EXISTS idx_apps_status_sort
ON apps (status, sort_order);
