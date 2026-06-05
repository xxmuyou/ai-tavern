-- spec-034: chat quality, single-thread memory, and prompt debug governance.

CREATE TABLE IF NOT EXISTS thread_memories (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  companion_id  TEXT NOT NULL REFERENCES companions(id),
  thread_id     TEXT NOT NULL REFERENCES threads(id),
  kind          TEXT NOT NULL CHECK (kind IN ('relationship_fact', 'user_preference', 'promise', 'open_loop', 'character_state')),
  content       TEXT NOT NULL,
  importance    INTEGER NOT NULL DEFAULT 50 CHECK (importance >= 1 AND importance <= 100),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'dismissed')),
  source        TEXT NOT NULL DEFAULT 'ai_extract',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_thread_memories_thread
  ON thread_memories(thread_id, status, importance, updated_at);

CREATE INDEX IF NOT EXISTS idx_thread_memories_user_companion
  ON thread_memories(user_id, companion_id, status);

CREATE TABLE IF NOT EXISTS prompt_debug_snapshots (
  id             TEXT PRIMARY KEY,
  user_id        TEXT REFERENCES users(id),
  companion_id   TEXT REFERENCES companions(id),
  thread_id      TEXT REFERENCES threads(id),
  message_id     TEXT REFERENCES messages(id),
  segments_json  TEXT NOT NULL,
  token_estimate INTEGER,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_debug_thread
  ON prompt_debug_snapshots(thread_id, created_at);

INSERT INTO llm_config (task, provider, model, fallback_provider, fallback_model, updated_at, updated_by)
VALUES ('memory_extract', 'deepseek', 'deepseek-chat', 'openai', 'gpt-4o-mini', unixepoch() * 1000, NULL)
ON CONFLICT(task) DO NOTHING;
