-- spec-020 §C / spec-022: generic image generation jobs
--
-- Tracks image generation tasks that are NOT bound to an existing companion.
-- The first consumer (spec-022 WF-1 create) is the companion base-art draft
-- step: a user picks a style + prompt and generates a base portrait BEFORE
-- any companion record exists, so it cannot live in companion_art_jobs
-- (which requires companion_id + source_art_url + a uniqueness triplet).
--
-- This table follows spec-020 §C so future generic generation tasks
-- (image_to_image, edit, scene art, etc.) reuse the same row shape. The v1
-- create flow only populates a subset of columns; the rest stay NULL until
-- the features that need them land.
CREATE TABLE image_generation_jobs (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT REFERENCES users(id),
  task                  TEXT NOT NULL,                  -- e.g. companion_base_art
  mode                  TEXT NOT NULL,                  -- text_to_image / image_to_image / edit
  status                TEXT NOT NULL,                  -- pending / processing / succeeded / failed / cancelled
  style                 TEXT,                           -- realistic / anime_jp / anime_kr
  provider              TEXT,
  model                 TEXT,
  prompt                TEXT NOT NULL,
  negative_prompt       TEXT,
  input_keys            TEXT,                           -- JSON array of R2 keys/URLs
  mask_key              TEXT,
  output_prefix         TEXT NOT NULL,
  output_key            TEXT,
  output_content_type   TEXT,
  provider_task_id      TEXT,
  error_code            TEXT,
  error_message         TEXT,
  retry_count           INTEGER NOT NULL DEFAULT 0,
  billing_ref           TEXT,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  completed_at          INTEGER
);

CREATE INDEX idx_image_generation_jobs_user ON image_generation_jobs(user_id, created_at);
CREATE INDEX idx_image_generation_jobs_task_status ON image_generation_jobs(task, status, updated_at);
CREATE INDEX idx_image_generation_jobs_provider_task ON image_generation_jobs(provider_task_id);
