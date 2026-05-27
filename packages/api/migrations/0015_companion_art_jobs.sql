-- spec-020: Companion emotion art generation jobs
--
-- Tracks per-emotion image generation jobs for companion portraits.
-- One row represents one queued/processing/completed/failed generation
-- attempt against a specific (companion, emotion, source neutral art).
--
-- The unique constraint on (companion_id, emotion, source_art_url) means
-- changing the neutral image lets us re-run generation for the same
-- emotion; the previous job stays as historical record.
CREATE TABLE companion_art_jobs (
  id              TEXT PRIMARY KEY,
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  user_id         TEXT REFERENCES users(id),
  emotion         TEXT NOT NULL,
  status          TEXT NOT NULL,
  source_art_url  TEXT NOT NULL,
  output_key      TEXT,
  provider        TEXT,
  model           TEXT,
  prompt          TEXT NOT NULL,
  error_code      TEXT,
  error_message   TEXT,
  credit_txn_id   TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  completed_at    INTEGER,
  UNIQUE (companion_id, emotion, source_art_url)
);

CREATE INDEX idx_companion_art_jobs_companion ON companion_art_jobs(companion_id, status);
CREATE INDEX idx_companion_art_jobs_user ON companion_art_jobs(user_id, created_at);
CREATE INDEX idx_companion_art_jobs_status ON companion_art_jobs(status, updated_at);
