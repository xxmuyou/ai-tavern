-- spec-022 second batch: structured asset tags + 0-1 LoRA catalog/allowlist.
--
-- Tags classify assets; workflow/checkpoint/LoRA allowlists decide whether a
-- combination may run. LoRA node field names remain workflow contract governed.

ALTER TABLE image_models ADD COLUMN architecture TEXT NOT NULL DEFAULT '';
ALTER TABLE image_models ADD COLUMN style_family TEXT NOT NULL DEFAULT '';
ALTER TABLE image_models ADD COLUMN purpose TEXT NOT NULL DEFAULT '';
ALTER TABLE image_models ADD COLUMN tags TEXT NOT NULL DEFAULT '';

UPDATE image_models
SET tags = tag
WHERE tags = '' AND tag IS NOT NULL AND tag <> '';

ALTER TABLE image_workflows ADD COLUMN lora_node_id TEXT;
ALTER TABLE image_workflows ADD COLUMN lora_name_field_name TEXT NOT NULL DEFAULT 'lora_name';
ALTER TABLE image_workflows ADD COLUMN lora_model_strength_field_name TEXT NOT NULL DEFAULT 'strength_model';
ALTER TABLE image_workflows ADD COLUMN lora_clip_strength_field_name TEXT;

CREATE TABLE IF NOT EXISTS image_loras (
  id                      TEXT PRIMARY KEY,
  label                   TEXT NOT NULL,
  lora_name               TEXT NOT NULL,
  architecture            TEXT NOT NULL DEFAULT '',
  style_family            TEXT NOT NULL DEFAULT '',
  purpose                 TEXT NOT NULL DEFAULT '',
  tags                    TEXT NOT NULL DEFAULT '',
  default_model_strength  REAL NOT NULL DEFAULT 1,
  default_clip_strength   REAL,
  is_active               INTEGER NOT NULL DEFAULT 1,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  updated_at              INTEGER NOT NULL,
  updated_by              TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS image_workflow_model_loras (
  workflow_key TEXT NOT NULL,
  model_id     TEXT NOT NULL,
  lora_id      TEXT NOT NULL REFERENCES image_loras(id) ON DELETE CASCADE,
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  updated_by   TEXT REFERENCES users(id),
  PRIMARY KEY (workflow_key, model_id, lora_id),
  FOREIGN KEY (workflow_key, model_id)
    REFERENCES image_workflow_models(workflow_key, model_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_image_workflow_model_loras_lora
  ON image_workflow_model_loras(lora_id);
CREATE INDEX IF NOT EXISTS idx_image_workflow_model_loras_active
  ON image_workflow_model_loras(workflow_key, model_id, is_active, sort_order);

ALTER TABLE image_generation_jobs ADD COLUMN lora_id TEXT;
ALTER TABLE image_generation_jobs ADD COLUMN lora_name TEXT;
ALTER TABLE image_generation_jobs ADD COLUMN lora_model_strength REAL;
ALTER TABLE image_generation_jobs ADD COLUMN lora_clip_strength REAL;
