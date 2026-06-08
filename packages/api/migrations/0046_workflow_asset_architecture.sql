-- RunningHub checkpoint/LoRA base architecture guard.
--
-- Anime/Realistic is the visual lane. The checkpoint/LoRA base architecture
-- (sdxl/sd15/ilxl/flux1) is the compatibility key that prevents SDXL
-- checkpoints from being paired with FLUX/ILXL/etc. LoRA assets.
-- image_workflows.architecture is retained as a legacy NOT NULL column only;
-- current code does not use workflow rows as base-architecture owners.

ALTER TABLE image_workflows ADD COLUMN architecture TEXT NOT NULL DEFAULT 'sdxl';

UPDATE image_workflows
SET architecture = 'sdxl'
WHERE architecture IS NULL OR TRIM(architecture) = '';

UPDATE image_models
SET architecture = 'sdxl'
WHERE architecture IS NULL OR TRIM(architecture) = '';

UPDATE image_loras
SET architecture = 'sdxl'
WHERE architecture IS NULL OR TRIM(architecture) = '';
