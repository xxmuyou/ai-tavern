-- Refactor: unify portrait generation into "workflow -> models".
--
-- The hardcoded art-style enum (realistic/anime_jp/anime_kr) is downgraded to a
-- free-form `tag` on each model. Checkpoints are now single-sourced on models:
-- the WF1 wiring config no longer carries a default ckpt or a per-style
-- checkpoint field name. Each model belongs to a workflow (`workflow_key`) and
-- names its own checkpoint field + file. RunningHub-only; other providers ignore
-- these columns.

-- image_models: style_tag -> tag; add workflow ownership + checkpoint field.
ALTER TABLE image_models RENAME COLUMN style_tag TO tag;
ALTER TABLE image_models ADD COLUMN workflow_key TEXT NOT NULL DEFAULT 'wf1';
ALTER TABLE image_models ADD COLUMN checkpoint_field_name TEXT;

-- Backfill the checkpoint field name from the legacy per-style WF1 wiring so
-- existing models keep injecting into the same checkpoint node branch.
UPDATE image_models
SET checkpoint_field_name = CASE tag
  WHEN 'realistic' THEN 'Realistic'
  WHEN 'anime_jp'  THEN 'Anime_JP'
  WHEN 'anime_kr'  THEN 'Anime_KR'
  ELSE checkpoint_field_name
END
WHERE checkpoint_field_name IS NULL;

-- image_generation_jobs: carry the resolved workflow + checkpoint field so the
-- provider replay no longer depends on the removed style->workflow mapping.
-- The legacy `style` column is kept for historical rows but is no longer read.
ALTER TABLE image_generation_jobs ADD COLUMN workflow_key TEXT;
ALTER TABLE image_generation_jobs ADD COLUMN checkpoint_field_name TEXT;
