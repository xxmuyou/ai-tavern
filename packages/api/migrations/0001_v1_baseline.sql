-- v1 baseline schema (spec-003)
--
-- Replaces the entire pre-2026-05 schema (archived under migrations/_archive/2026-05).
-- Owning specs for each domain:
--   users / user_identities / sessions     -> spec-009 (OIDC + Magic Link)
--   companions                              -> spec-004
--   scenes                                  -> spec-007
--   relationships                           -> spec-005
--   threads / messages                      -> spec-006 (chat rewrite)
--   events                                  -> spec-008
--   subscriptions / usage_log               -> spec-010 (Stripe + quota)
--   llm_logs / llm_config                   -> spec-002 (LLM provider abstraction)
--   admin_users                             -> spec-011 (admin console)
--   asset_objects                           -> retained from prior schema; powers /objects upload handler
--
-- Boolean columns use INTEGER (D1/SQLite has no native BOOLEAN; 0 = false, 1 = true).
-- Timestamp columns store unix epoch milliseconds (INTEGER).

-- ============================================================
-- users
-- ============================================================
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  display_name    TEXT,
  locale          TEXT NOT NULL DEFAULT 'en-US',
  created_at      INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_last_seen ON users(last_seen_at);

-- ============================================================
-- user_identities (Google / Apple / Email Magic Link bindings)
-- ============================================================
CREATE TABLE user_identities (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id),
  provider          TEXT NOT NULL,
  provider_subject  TEXT NOT NULL,
  provider_email    TEXT,
  created_at        INTEGER NOT NULL,
  UNIQUE (provider, provider_subject)
);

CREATE INDEX idx_user_identities_user ON user_identities(user_id);

-- ============================================================
-- sessions
-- ============================================================
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  jwt_jti     TEXT UNIQUE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  revoked_at  INTEGER
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- ============================================================
-- companions (official + user-created)
-- ============================================================
CREATE TABLE companions (
  id                  TEXT PRIMARY KEY,
  source              TEXT NOT NULL,
  created_by          TEXT REFERENCES users(id),
  is_active           INTEGER NOT NULL DEFAULT 1,
  name                TEXT NOT NULL,
  appearance          TEXT,
  personality         TEXT,
  background          TEXT,
  speech_style        TEXT,
  relationship_role   TEXT,
  preferred_scenes    TEXT,
  art_url             TEXT,
  initial_dims        TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX idx_companions_source ON companions(source);
CREATE INDEX idx_companions_owner ON companions(created_by);
CREATE INDEX idx_companions_active ON companions(is_active);

-- ============================================================
-- scenes (official only, no user-created in v1)
-- ============================================================
CREATE TABLE scenes (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  mood                TEXT NOT NULL,
  tags                TEXT,
  possible_events     TEXT,
  default_companions  TEXT,
  unlock_condition    TEXT,
  art_url             TEXT,
  display_order       INTEGER NOT NULL DEFAULT 0,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL
);

CREATE INDEX idx_scenes_active ON scenes(is_active);
CREATE INDEX idx_scenes_order ON scenes(display_order);

-- ============================================================
-- relationships (user x companion, 7-dimension singularity)
-- ============================================================
CREATE TABLE relationships (
  user_id              TEXT NOT NULL REFERENCES users(id),
  companion_id         TEXT NOT NULL REFERENCES companions(id),
  closeness            INTEGER NOT NULL DEFAULT 0,
  trust                INTEGER NOT NULL DEFAULT 0,
  romance              INTEGER NOT NULL DEFAULT 0,
  friendship           INTEGER NOT NULL DEFAULT 0,
  hostility            INTEGER NOT NULL DEFAULT 0,
  tension              INTEGER NOT NULL DEFAULT 0,
  distance             INTEGER NOT NULL DEFAULT 0,
  level_label          TEXT,
  first_met_at         INTEGER NOT NULL,
  last_interaction_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, companion_id)
);

CREATE INDEX idx_relationships_companion ON relationships(companion_id);
CREATE INDEX idx_relationships_last_interaction ON relationships(last_interaction_at);

-- ============================================================
-- threads (one per (user, companion))
-- ============================================================
CREATE TABLE threads (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id),
  companion_id              TEXT NOT NULL REFERENCES companions(id),
  scene_context             TEXT,
  summary                   TEXT,
  summary_until_message_id  TEXT,
  message_count             INTEGER NOT NULL DEFAULT 0,
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,
  UNIQUE (user_id, companion_id)
);

CREATE INDEX idx_threads_user ON threads(user_id);
CREATE INDEX idx_threads_updated ON threads(updated_at);

-- ============================================================
-- messages (conversation history)
-- ============================================================
CREATE TABLE messages (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL REFERENCES threads(id),
  role          TEXT NOT NULL,
  content       TEXT NOT NULL,
  scene_id      TEXT,
  signals       TEXT,
  emotion       TEXT,
  llm_provider  TEXT,
  llm_model     TEXT,
  token_input   INTEGER,
  token_output  INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE INDEX idx_messages_thread ON messages(thread_id, created_at);
CREATE INDEX idx_messages_created ON messages(created_at);

-- ============================================================
-- events (triggered narrative events)
-- ============================================================
CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  companion_id  TEXT NOT NULL REFERENCES companions(id),
  scene_id      TEXT NOT NULL REFERENCES scenes(id),
  event_type    TEXT NOT NULL,
  payload       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  resolution    TEXT,
  created_at    INTEGER NOT NULL,
  resolved_at   INTEGER
);

CREATE INDEX idx_events_user_companion ON events(user_id, companion_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_type ON events(event_type);

-- ============================================================
-- subscriptions (Stripe)
-- ============================================================
CREATE TABLE subscriptions (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id),
  stripe_customer_id    TEXT NOT NULL,
  status                TEXT NOT NULL,
  price_id              TEXT NOT NULL,
  current_period_start  INTEGER NOT NULL,
  current_period_end    INTEGER NOT NULL,
  cancel_at_period_end  INTEGER NOT NULL DEFAULT 0,
  canceled_at           INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end);

-- ============================================================
-- usage_log (daily usage audit; KV holds the hot-path counters)
-- ============================================================
CREATE TABLE usage_log (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  date_utc       TEXT NOT NULL,
  message_count  INTEGER NOT NULL DEFAULT 0,
  event_count    INTEGER NOT NULL DEFAULT 0,
  llm_cost_usd   REAL NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  UNIQUE (user_id, date_utc)
);

CREATE INDEX idx_usage_user_date ON usage_log(user_id, date_utc);

-- ============================================================
-- llm_logs (per-call audit; archived to R2 after 30 days)
-- ============================================================
CREATE TABLE llm_logs (
  id             TEXT PRIMARY KEY,
  user_id        TEXT REFERENCES users(id),
  task           TEXT NOT NULL,
  provider       TEXT NOT NULL,
  model          TEXT NOT NULL,
  status         TEXT NOT NULL,
  latency_ms     INTEGER,
  token_input    INTEGER,
  token_output   INTEGER,
  cost_usd       REAL,
  error_code     TEXT,
  error_message  TEXT,
  created_at     INTEGER NOT NULL
);

CREATE INDEX idx_llm_logs_user ON llm_logs(user_id, created_at);
CREATE INDEX idx_llm_logs_status ON llm_logs(status);
CREATE INDEX idx_llm_logs_provider ON llm_logs(provider, created_at);

-- ============================================================
-- llm_config (admin-controlled provider/model routing per task)
-- ============================================================
CREATE TABLE llm_config (
  task               TEXT PRIMARY KEY,
  provider           TEXT NOT NULL,
  model              TEXT NOT NULL,
  fallback_provider  TEXT,
  fallback_model     TEXT,
  updated_at         INTEGER NOT NULL,
  updated_by         TEXT REFERENCES users(id)
);

-- ============================================================
-- admin_users (email-whitelist admins; populated at runtime)
-- ============================================================
CREATE TABLE admin_users (
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  role        TEXT NOT NULL DEFAULT 'admin',
  granted_at  INTEGER NOT NULL,
  granted_by  TEXT REFERENCES users(id)
);

-- ============================================================
-- asset_objects (retained from prior schema; tracks R2 uploads)
-- ============================================================
CREATE TABLE asset_objects (
  key           TEXT PRIMARY KEY,
  content_type  TEXT,
  size_bytes    INTEGER
);
