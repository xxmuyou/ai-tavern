-- Admin-editable operational settings (key/value), read at runtime with env as
-- fallback. Lets the super-admin configure integrations (RunningHub/image-gen,
-- LLM keys, rate limits, email) from the admin workspace without editing
-- wrangler/.env or redeploying. Per-environment because each environment has
-- its own D1. Secrecy is decided by the code-side registry, not stored here.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users(id)
);
