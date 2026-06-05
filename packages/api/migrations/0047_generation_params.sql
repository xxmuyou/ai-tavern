-- RunningHub per-workflow generation parameter mappings and per-job values.
--
-- generation_params_json on image_workflows stores contract-governed mappings
-- for latent dimensions, batch size, KSampler seed, and allowed size presets.
-- generation_params_json on image_generation_jobs stores the concrete values
-- chosen for a queued generation.

ALTER TABLE image_workflows ADD COLUMN generation_params_json TEXT;
ALTER TABLE image_generation_jobs ADD COLUMN generation_params_json TEXT;
