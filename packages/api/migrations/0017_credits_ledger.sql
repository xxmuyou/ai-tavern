-- spec-021: Credits Ledger and Metering
-- credit_accounts caches current balance; credit_ledger_entries is the
-- immutable source of truth for grants, purchases, reservations, commits,
-- releases, refunds and admin adjustments.

CREATE TABLE credit_accounts (
  user_id              TEXT PRIMARY KEY REFERENCES users(id),
  available_credits    INTEGER NOT NULL DEFAULT 0,
  reserved_credits     INTEGER NOT NULL DEFAULT 0,
  updated_at           INTEGER NOT NULL
);

CREATE TABLE credit_ledger_entries (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id),
  type                 TEXT NOT NULL,
  amount               INTEGER NOT NULL,
  balance_after        INTEGER,
  reserved_after       INTEGER,
  task_type            TEXT,
  reference_type       TEXT,
  reference_id         TEXT,
  stripe_session_id    TEXT,
  stripe_payment_id    TEXT,
  expires_at           INTEGER,
  metadata             TEXT,
  created_at           INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_credit_ledger_reference
  ON credit_ledger_entries(type, reference_type, reference_id)
  WHERE reference_type IS NOT NULL AND reference_id IS NOT NULL;

CREATE INDEX idx_credit_ledger_user_time ON credit_ledger_entries(user_id, created_at);
CREATE INDEX idx_credit_ledger_expiry ON credit_ledger_entries(expires_at);

-- ROLLBACK:
-- DROP TABLE IF EXISTS credit_ledger_entries;
-- DROP TABLE IF EXISTS credit_accounts;
