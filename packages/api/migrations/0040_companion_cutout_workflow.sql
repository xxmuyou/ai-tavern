-- spec-031: companion cutout cache + cutout workflow mode.
--
-- Keep historical emotion-art data, but add a reusable cutout cache keyed by
-- the companion's current base art. The cutout execution itself still uses the
-- generic image_generation_jobs table; this table keeps companion semantics.

ALTER TABLE companions ADD COLUMN art_cutout_key TEXT;

CREATE TABLE companion_cutout_jobs (
  id              TEXT PRIMARY KEY,
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  user_id         TEXT REFERENCES users(id),
  source_art_url  TEXT NOT NULL,
  image_job_id    TEXT NOT NULL REFERENCES image_generation_jobs(id),
  status          TEXT NOT NULL,
  output_key      TEXT,
  error_code      TEXT,
  error_message   TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  completed_at    INTEGER,
  UNIQUE (companion_id, source_art_url)
);

CREATE INDEX idx_companion_cutout_jobs_image_job ON companion_cutout_jobs(image_job_id);
CREATE INDEX idx_companion_cutout_jobs_companion_status ON companion_cutout_jobs(companion_id, status);

-- SQLite cannot alter a CHECK constraint in place. Rebuild image_workflows so
-- wf_cutout can be a first-class catalog mode alongside create/variation.
PRAGMA foreign_keys = OFF;

CREATE TABLE image_workflows_new (
  key                         TEXT PRIMARY KEY,
  label                       TEXT NOT NULL,
  mode                        TEXT NOT NULL CHECK (mode IN ('create', 'variation', 'cutout')),
  workflow_id                 TEXT NOT NULL DEFAULT '',
  prompt_node_id              TEXT NOT NULL DEFAULT '',
  prompt_field_name           TEXT NOT NULL DEFAULT 'text',
  checkpoint_node_id          TEXT,
  checkpoint_field_name       TEXT NOT NULL DEFAULT 'ckpt_name',
  load_image_node_id          TEXT,
  negative_prompt_node_id     TEXT,
  negative_prompt_field_name  TEXT NOT NULL DEFAULT 'prompt',
  is_active                   INTEGER NOT NULL DEFAULT 1,
  sort_order                  INTEGER NOT NULL DEFAULT 0,
  updated_at                  INTEGER NOT NULL,
  updated_by                  TEXT REFERENCES users(id)
);

INSERT INTO image_workflows_new
  (key, label, mode, workflow_id, prompt_node_id, prompt_field_name,
   checkpoint_node_id, checkpoint_field_name, load_image_node_id,
   negative_prompt_node_id, negative_prompt_field_name,
   is_active, sort_order, updated_at, updated_by)
SELECT
  key, label, mode, workflow_id, prompt_node_id, prompt_field_name,
  checkpoint_node_id, checkpoint_field_name, load_image_node_id,
  negative_prompt_node_id, negative_prompt_field_name,
  is_active, sort_order, updated_at, updated_by
FROM image_workflows;

DROP TABLE image_workflows;
ALTER TABLE image_workflows_new RENAME TO image_workflows;

PRAGMA foreign_keys = ON;

UPDATE image_workflows SET is_active = 0, updated_at = 0 WHERE key = 'wf2';

INSERT OR IGNORE INTO image_workflows
  (key, label, mode, workflow_id, prompt_node_id, prompt_field_name,
   checkpoint_node_id, checkpoint_field_name, load_image_node_id,
   negative_prompt_node_id, negative_prompt_field_name,
   is_active, sort_order, updated_at, updated_by)
VALUES
  ('wf_cutout', 'WF_CUTOUT - companion matting (cutout)', 'cutout', '', '', 'text',
   NULL, 'ckpt_name', '', NULL, 'prompt', 1, 35, 0, NULL);
