-- User-saved image assets and prompt assistant routing.
--
-- Generated base-art jobs remain operational records in image_generation_jobs.
-- This table is the user-facing gallery shown in Me.
CREATE TABLE user_image_assets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  art_key     TEXT NOT NULL,
  source      TEXT NOT NULL,
  prompt      TEXT,
  model_id    TEXT,
  created_at  INTEGER NOT NULL,
  deleted_at  INTEGER,
  UNIQUE (user_id, art_key)
);

CREATE INDEX idx_user_image_assets_user_created
  ON user_image_assets(user_id, created_at);

INSERT OR IGNORE INTO llm_config
  (task, provider, model, fallback_provider, fallback_model, updated_at, updated_by)
VALUES
  ('image_prompt_assist', 'deepseek', 'deepseek-chat', 'openai', 'gpt-4o-mini', unixepoch() * 1000, NULL);
