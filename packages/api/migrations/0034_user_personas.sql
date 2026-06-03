-- 0034: user personas.
-- A user-authored "who I am" identity. The companion needs to know who it is
-- talking to for the relationship/intimacy ladder to mean anything; until now
-- the chat system prompt injected only the character's own persona, never the
-- user's. Each user can keep several personas (one marked default) and bind one
-- to each thread. Threads without a persona fall back to the user's default.
CREATE TABLE IF NOT EXISTS user_personas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  gender TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_personas_user ON user_personas(user_id, is_active);

-- Which persona this thread speaks as. NULL = use the user's default persona at
-- send time (or no persona injection if the user has none).
ALTER TABLE threads ADD COLUMN persona_id TEXT;
