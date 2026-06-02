-- RunningHub workflow/checkpoint catalog repair.
--
-- Previous migration 0026 put workflow ownership and checkpoint field names on
-- image_models. That let legacy style names like Anime_JP leak into
-- RunningHub nodeInfo.fieldName. Field names belong to workflow nodes, not
-- checkpoint/model rows. This migration keeps image_models as the checkpoint
-- catalog and adds workflow + binding tables.

CREATE TABLE IF NOT EXISTS image_workflows (
  key                   TEXT PRIMARY KEY,
  label                 TEXT NOT NULL,
  mode                  TEXT NOT NULL CHECK (mode IN ('create', 'variation')),
  workflow_id           TEXT NOT NULL DEFAULT '',
  prompt_node_id        TEXT NOT NULL DEFAULT '',
  checkpoint_node_id    TEXT,
  checkpoint_field_name TEXT NOT NULL DEFAULT 'ckpt_name',
  load_image_node_id    TEXT,
  is_active             INTEGER NOT NULL DEFAULT 1,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  updated_at            INTEGER NOT NULL,
  updated_by            TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS image_workflow_models (
  workflow_key TEXT NOT NULL REFERENCES image_workflows(key) ON DELETE CASCADE,
  model_id     TEXT NOT NULL REFERENCES image_models(id) ON DELETE CASCADE,
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  updated_by   TEXT REFERENCES users(id),
  PRIMARY KEY (workflow_key, model_id)
);

CREATE INDEX IF NOT EXISTS idx_image_workflow_models_model ON image_workflow_models(model_id);
CREATE INDEX IF NOT EXISTS idx_image_workflow_models_active ON image_workflow_models(workflow_key, is_active, sort_order);

-- Default placeholders keep old deployments usable until the repo config sync
-- seeds the real IDs.
INSERT OR IGNORE INTO image_workflows
  (key, label, mode, workflow_id, prompt_node_id, checkpoint_node_id,
   checkpoint_field_name, load_image_node_id, is_active, sort_order, updated_at, updated_by)
VALUES
  ('wf1', 'WF1 - base portrait (create)', 'create', '', '', NULL, 'ckpt_name', NULL, 1, 10, 0, NULL),
  ('wf2', 'WF2 - expression variants (variation)', 'variation', '', '', NULL, 'ckpt_name', '', 1, 20, 0, NULL);

-- Backfill any workflow keys introduced by 0026, then bind each existing model
-- to its old workflow. The old image_models.checkpoint_field_name column is
-- intentionally ignored from here on.
INSERT OR IGNORE INTO image_workflows
  (key, label, mode, workflow_id, prompt_node_id, checkpoint_node_id,
   checkpoint_field_name, load_image_node_id, is_active, sort_order, updated_at, updated_by)
SELECT DISTINCT
  COALESCE(NULLIF(workflow_key, ''), 'wf1') AS key,
  COALESCE(NULLIF(workflow_key, ''), 'wf1') AS label,
  'create',
  '',
  '',
  NULL,
  'ckpt_name',
  NULL,
  1,
  100,
  0,
  NULL
FROM image_models;

INSERT OR IGNORE INTO image_workflow_models
  (workflow_key, model_id, is_active, sort_order, updated_at, updated_by)
SELECT
  COALESCE(NULLIF(workflow_key, ''), 'wf1'),
  id,
  is_active,
  sort_order,
  updated_at,
  updated_by
FROM image_models;
