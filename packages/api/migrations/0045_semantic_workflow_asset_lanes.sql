-- RunningHub semantic workflow + Anime/Realistic lane cleanup.
--
-- Keep old applied migrations intact, but move live catalog/config data away
-- from numeric workflow keys and JP/KR anime buckets. Runtime still has a
-- read-compatibility map for historical job payloads; new catalog rows and
-- Admin settings should use semantic workflow keys and only anime/realistic
-- asset lanes.

-- Copy legacy provider/base-prompt settings to semantic keys, then remove the
-- old Admin-facing keys so Settings no longer shows numeric workflow labels.
INSERT OR IGNORE INTO app_settings (key, value, updated_at, updated_by)
SELECT 'image_gen.portrait_create_provider', value, updated_at, updated_by
FROM app_settings
WHERE key = 'image_gen.wf1_provider';

INSERT OR IGNORE INTO app_settings (key, value, updated_at, updated_by)
SELECT 'image_gen.portrait_variation_provider', value, updated_at, updated_by
FROM app_settings
WHERE key = 'image_gen.wf2_provider';

INSERT OR IGNORE INTO app_settings (key, value, updated_at, updated_by)
SELECT 'image_gen.chat_moment_provider', value, updated_at, updated_by
FROM app_settings
WHERE key = 'image_gen.wf_moment_provider';

INSERT OR IGNORE INTO app_settings (key, value, updated_at, updated_by)
SELECT 'image_gen.companion_cutout_provider', value, updated_at, updated_by
FROM app_settings
WHERE key = 'image_gen.wf_cutout_provider';

INSERT OR IGNORE INTO app_settings (key, value, updated_at, updated_by)
SELECT 'image_gen.profile_outfit_provider', value, updated_at, updated_by
FROM app_settings
WHERE key = 'image_gen.wf_outfit_provider';

INSERT OR IGNORE INTO app_settings (key, value, updated_at, updated_by)
SELECT 'image_gen.portrait_create_base_prompt', value, updated_at, updated_by
FROM app_settings
WHERE key = 'image_gen.wf1_base_prompt';

INSERT OR IGNORE INTO app_settings (key, value, updated_at, updated_by)
SELECT 'image_gen.chat_moment_base_prompt', value, updated_at, updated_by
FROM app_settings
WHERE key = 'image_gen.wf_moment_base_prompt';

DELETE FROM app_settings
WHERE key IN (
  'image_gen.wf1_provider',
  'image_gen.wf2_provider',
  'image_gen.wf_moment_provider',
  'image_gen.wf_cutout_provider',
  'image_gen.wf_outfit_provider',
  'image_gen.wf1_base_prompt',
  'image_gen.wf_moment_base_prompt'
);

-- Seed semantic workflow rows from legacy rows before moving child bindings.
INSERT OR IGNORE INTO image_workflows
  (key, label, mode, workflow_id, prompt_node_id, prompt_field_name,
   checkpoint_node_id, checkpoint_field_name, load_image_node_id,
   load_image_field_name, negative_prompt_node_id, negative_prompt_field_name,
   contract_json, contract_hash, contract_refreshed_at, lora_node_id,
   lora_name_field_name, lora_model_strength_field_name,
   lora_clip_strength_field_name, is_active, sort_order, updated_at, updated_by)
SELECT 'portrait_create', 'Portrait create', mode, workflow_id, prompt_node_id,
       prompt_field_name, checkpoint_node_id, checkpoint_field_name,
       load_image_node_id, load_image_field_name, negative_prompt_node_id,
       negative_prompt_field_name, contract_json, contract_hash,
       contract_refreshed_at, lora_node_id, lora_name_field_name,
       lora_model_strength_field_name, lora_clip_strength_field_name,
       is_active, sort_order, updated_at, updated_by
FROM image_workflows
WHERE key = 'wf1';

INSERT OR IGNORE INTO image_workflows
  (key, label, mode, workflow_id, prompt_node_id, prompt_field_name,
   checkpoint_node_id, checkpoint_field_name, load_image_node_id,
   load_image_field_name, negative_prompt_node_id, negative_prompt_field_name,
   contract_json, contract_hash, contract_refreshed_at, lora_node_id,
   lora_name_field_name, lora_model_strength_field_name,
   lora_clip_strength_field_name, is_active, sort_order, updated_at, updated_by)
SELECT 'portrait_variation', 'Portrait variation (retired)', mode, workflow_id, prompt_node_id,
       prompt_field_name, checkpoint_node_id, checkpoint_field_name,
       load_image_node_id, load_image_field_name, negative_prompt_node_id,
       negative_prompt_field_name, contract_json, contract_hash,
       contract_refreshed_at, lora_node_id, lora_name_field_name,
       lora_model_strength_field_name, lora_clip_strength_field_name,
       0, sort_order, updated_at, updated_by
FROM image_workflows
WHERE key = 'wf2';

INSERT OR IGNORE INTO image_workflows
  (key, label, mode, workflow_id, prompt_node_id, prompt_field_name,
   checkpoint_node_id, checkpoint_field_name, load_image_node_id,
   load_image_field_name, negative_prompt_node_id, negative_prompt_field_name,
   contract_json, contract_hash, contract_refreshed_at, lora_node_id,
   lora_name_field_name, lora_model_strength_field_name,
   lora_clip_strength_field_name, is_active, sort_order, updated_at, updated_by)
SELECT 'chat_moment', 'Chat moment image', mode, workflow_id, prompt_node_id,
       prompt_field_name, checkpoint_node_id, checkpoint_field_name,
       load_image_node_id, load_image_field_name, negative_prompt_node_id,
       negative_prompt_field_name, contract_json, contract_hash,
       contract_refreshed_at, lora_node_id, lora_name_field_name,
       lora_model_strength_field_name, lora_clip_strength_field_name,
       is_active, sort_order, updated_at, updated_by
FROM image_workflows
WHERE key = 'wf_moment';

INSERT OR IGNORE INTO image_workflows
  (key, label, mode, workflow_id, prompt_node_id, prompt_field_name,
   checkpoint_node_id, checkpoint_field_name, load_image_node_id,
   load_image_field_name, negative_prompt_node_id, negative_prompt_field_name,
   contract_json, contract_hash, contract_refreshed_at, lora_node_id,
   lora_name_field_name, lora_model_strength_field_name,
   lora_clip_strength_field_name, is_active, sort_order, updated_at, updated_by)
SELECT 'companion_cutout', 'Companion cutout', mode, workflow_id, prompt_node_id,
       prompt_field_name, checkpoint_node_id, checkpoint_field_name,
       load_image_node_id, load_image_field_name, negative_prompt_node_id,
       negative_prompt_field_name, contract_json, contract_hash,
       contract_refreshed_at, lora_node_id, lora_name_field_name,
       lora_model_strength_field_name, lora_clip_strength_field_name,
       is_active, sort_order, updated_at, updated_by
FROM image_workflows
WHERE key = 'wf_cutout';

INSERT OR IGNORE INTO image_workflows
  (key, label, mode, workflow_id, prompt_node_id, prompt_field_name,
   checkpoint_node_id, checkpoint_field_name, load_image_node_id,
   load_image_field_name, negative_prompt_node_id, negative_prompt_field_name,
   contract_json, contract_hash, contract_refreshed_at, lora_node_id,
   lora_name_field_name, lora_model_strength_field_name,
   lora_clip_strength_field_name, is_active, sort_order, updated_at, updated_by)
SELECT 'profile_outfit', 'Profile outfit image', mode, workflow_id, prompt_node_id,
       prompt_field_name, checkpoint_node_id, checkpoint_field_name,
       load_image_node_id, load_image_field_name, negative_prompt_node_id,
       negative_prompt_field_name, contract_json, contract_hash,
       contract_refreshed_at, lora_node_id, lora_name_field_name,
       lora_model_strength_field_name, lora_clip_strength_field_name,
       is_active, sort_order, updated_at, updated_by
FROM image_workflows
WHERE key = 'wf_outfit';

DELETE FROM image_workflow_model_loras
WHERE workflow_key = 'wf1'
  AND EXISTS (SELECT 1 FROM image_workflow_model_loras newer WHERE newer.workflow_key = 'portrait_create' AND newer.model_id = image_workflow_model_loras.model_id AND newer.lora_id = image_workflow_model_loras.lora_id);
DELETE FROM image_workflow_model_loras
WHERE workflow_key = 'wf2'
  AND EXISTS (SELECT 1 FROM image_workflow_model_loras newer WHERE newer.workflow_key = 'portrait_variation' AND newer.model_id = image_workflow_model_loras.model_id AND newer.lora_id = image_workflow_model_loras.lora_id);
DELETE FROM image_workflow_model_loras
WHERE workflow_key = 'wf_moment'
  AND EXISTS (SELECT 1 FROM image_workflow_model_loras newer WHERE newer.workflow_key = 'chat_moment' AND newer.model_id = image_workflow_model_loras.model_id AND newer.lora_id = image_workflow_model_loras.lora_id);
DELETE FROM image_workflow_model_loras
WHERE workflow_key = 'wf_cutout'
  AND EXISTS (SELECT 1 FROM image_workflow_model_loras newer WHERE newer.workflow_key = 'companion_cutout' AND newer.model_id = image_workflow_model_loras.model_id AND newer.lora_id = image_workflow_model_loras.lora_id);
DELETE FROM image_workflow_model_loras
WHERE workflow_key = 'wf_outfit'
  AND EXISTS (SELECT 1 FROM image_workflow_model_loras newer WHERE newer.workflow_key = 'profile_outfit' AND newer.model_id = image_workflow_model_loras.model_id AND newer.lora_id = image_workflow_model_loras.lora_id);

DELETE FROM image_workflow_models
WHERE workflow_key = 'wf1'
  AND EXISTS (SELECT 1 FROM image_workflow_models newer WHERE newer.workflow_key = 'portrait_create' AND newer.model_id = image_workflow_models.model_id);
DELETE FROM image_workflow_models
WHERE workflow_key = 'wf2'
  AND EXISTS (SELECT 1 FROM image_workflow_models newer WHERE newer.workflow_key = 'portrait_variation' AND newer.model_id = image_workflow_models.model_id);
DELETE FROM image_workflow_models
WHERE workflow_key = 'wf_moment'
  AND EXISTS (SELECT 1 FROM image_workflow_models newer WHERE newer.workflow_key = 'chat_moment' AND newer.model_id = image_workflow_models.model_id);
DELETE FROM image_workflow_models
WHERE workflow_key = 'wf_cutout'
  AND EXISTS (SELECT 1 FROM image_workflow_models newer WHERE newer.workflow_key = 'companion_cutout' AND newer.model_id = image_workflow_models.model_id);
DELETE FROM image_workflow_models
WHERE workflow_key = 'wf_outfit'
  AND EXISTS (SELECT 1 FROM image_workflow_models newer WHERE newer.workflow_key = 'profile_outfit' AND newer.model_id = image_workflow_models.model_id);

UPDATE image_workflow_models SET workflow_key = 'portrait_create' WHERE workflow_key = 'wf1';
UPDATE image_workflow_models SET workflow_key = 'portrait_variation' WHERE workflow_key = 'wf2';
UPDATE image_workflow_models SET workflow_key = 'chat_moment' WHERE workflow_key = 'wf_moment';
UPDATE image_workflow_models SET workflow_key = 'companion_cutout' WHERE workflow_key = 'wf_cutout';
UPDATE image_workflow_models SET workflow_key = 'profile_outfit' WHERE workflow_key = 'wf_outfit';

UPDATE image_workflow_model_loras SET workflow_key = 'portrait_create' WHERE workflow_key = 'wf1';
UPDATE image_workflow_model_loras SET workflow_key = 'portrait_variation' WHERE workflow_key = 'wf2';
UPDATE image_workflow_model_loras SET workflow_key = 'chat_moment' WHERE workflow_key = 'wf_moment';
UPDATE image_workflow_model_loras SET workflow_key = 'companion_cutout' WHERE workflow_key = 'wf_cutout';
UPDATE image_workflow_model_loras SET workflow_key = 'profile_outfit' WHERE workflow_key = 'wf_outfit';

UPDATE image_generation_jobs SET workflow_key = 'portrait_create' WHERE workflow_key = 'wf1';
UPDATE image_generation_jobs SET workflow_key = 'portrait_variation' WHERE workflow_key = 'wf2';
UPDATE image_generation_jobs SET workflow_key = 'chat_moment' WHERE workflow_key = 'wf_moment';
UPDATE image_generation_jobs SET workflow_key = 'companion_cutout' WHERE workflow_key = 'wf_cutout';
UPDATE image_generation_jobs SET workflow_key = 'profile_outfit' WHERE workflow_key = 'wf_outfit';

DELETE FROM image_workflows WHERE key IN ('wf1', 'wf2', 'wf_moment', 'wf_cutout', 'wf_outfit');

-- Normalize old anime region buckets into the single Anime lane.
UPDATE image_models
SET tag = 'anime',
    style_family = 'anime',
    tags = 'anime',
    label = REPLACE(REPLACE(REPLACE(REPLACE(label, 'Anime JP', 'Anime'), 'Anime KR', 'Anime'), 'Anime (JP)', 'Anime'), 'Anime (KR)', 'Anime')
WHERE tag IN ('anime_jp', 'anime_kr', 'anime,jp', 'anime,kr')
   OR tags IN ('anime_jp', 'anime_kr', 'anime,jp', 'anime,kr')
   OR id LIKE 'anime\_jp\_%' ESCAPE '\'
   OR id LIKE 'anime\_kr\_%' ESCAPE '\';

UPDATE image_loras
SET style_family = 'anime',
    tags = 'anime',
    label = REPLACE(REPLACE(REPLACE(REPLACE(label, 'Anime JP', 'Anime'), 'Anime KR', 'Anime'), 'Anime (JP)', 'Anime'), 'Anime (KR)', 'Anime')
WHERE style_family IN ('anime_jp', 'anime_kr', 'anime,jp', 'anime,kr')
   OR tags IN ('anime_jp', 'anime_kr', 'anime,jp', 'anime,kr')
   OR id LIKE 'anime\_jp\_%' ESCAPE '\'
   OR id LIKE 'anime\_kr\_%' ESCAPE '\';

-- Rename known seeded checkpoint ids after references have been normalized.
DELETE FROM image_workflow_model_loras
WHERE model_id = 'anime_jp_animagine'
  AND EXISTS (SELECT 1 FROM image_workflow_model_loras newer WHERE newer.workflow_key = image_workflow_model_loras.workflow_key AND newer.model_id = 'anime_animagine' AND newer.lora_id = image_workflow_model_loras.lora_id);
DELETE FROM image_workflow_model_loras
WHERE model_id = 'anime_kr_ghostxl'
  AND EXISTS (SELECT 1 FROM image_workflow_model_loras newer WHERE newer.workflow_key = image_workflow_model_loras.workflow_key AND newer.model_id = 'anime_ghostxl' AND newer.lora_id = image_workflow_model_loras.lora_id);
DELETE FROM image_workflow_model_loras
WHERE model_id = 'anime_kr_selfup'
  AND EXISTS (SELECT 1 FROM image_workflow_model_loras newer WHERE newer.workflow_key = image_workflow_model_loras.workflow_key AND newer.model_id = 'anime_illustraversa' AND newer.lora_id = image_workflow_model_loras.lora_id);

DELETE FROM image_workflow_models
WHERE model_id = 'anime_jp_animagine'
  AND EXISTS (SELECT 1 FROM image_workflow_models newer WHERE newer.workflow_key = image_workflow_models.workflow_key AND newer.model_id = 'anime_animagine');
DELETE FROM image_workflow_models
WHERE model_id = 'anime_kr_ghostxl'
  AND EXISTS (SELECT 1 FROM image_workflow_models newer WHERE newer.workflow_key = image_workflow_models.workflow_key AND newer.model_id = 'anime_ghostxl');
DELETE FROM image_workflow_models
WHERE model_id = 'anime_kr_selfup'
  AND EXISTS (SELECT 1 FROM image_workflow_models newer WHERE newer.workflow_key = image_workflow_models.workflow_key AND newer.model_id = 'anime_illustraversa');

UPDATE image_workflow_model_loras
SET model_id = 'anime_animagine'
WHERE model_id = 'anime_jp_animagine'
  AND EXISTS (SELECT 1 FROM image_models WHERE id = 'anime_animagine');

UPDATE image_workflow_model_loras
SET model_id = 'anime_ghostxl'
WHERE model_id = 'anime_kr_ghostxl'
  AND EXISTS (SELECT 1 FROM image_models WHERE id = 'anime_ghostxl');

UPDATE image_workflow_model_loras
SET model_id = 'anime_illustraversa'
WHERE model_id = 'anime_kr_selfup'
  AND EXISTS (SELECT 1 FROM image_models WHERE id = 'anime_illustraversa');

UPDATE image_workflow_models
SET model_id = 'anime_animagine'
WHERE model_id = 'anime_jp_animagine'
  AND EXISTS (SELECT 1 FROM image_models WHERE id = 'anime_animagine');

UPDATE image_workflow_models
SET model_id = 'anime_ghostxl'
WHERE model_id = 'anime_kr_ghostxl'
  AND EXISTS (SELECT 1 FROM image_models WHERE id = 'anime_ghostxl');

UPDATE image_workflow_models
SET model_id = 'anime_illustraversa'
WHERE model_id = 'anime_kr_selfup'
  AND EXISTS (SELECT 1 FROM image_models WHERE id = 'anime_illustraversa');

DELETE FROM image_models
WHERE id IN ('anime_jp_animagine', 'anime_kr_ghostxl', 'anime_kr_selfup')
  AND EXISTS (
    SELECT 1 FROM image_workflow_models wm
    WHERE wm.model_id IN ('anime_animagine', 'anime_ghostxl', 'anime_illustraversa')
  );

UPDATE image_models SET id = 'anime_animagine' WHERE id = 'anime_jp_animagine';
UPDATE image_models SET id = 'anime_ghostxl' WHERE id = 'anime_kr_ghostxl';
UPDATE image_models SET id = 'anime_illustraversa' WHERE id = 'anime_kr_selfup';

UPDATE image_generation_jobs
SET style = 'anime'
WHERE style IN ('anime_jp', 'anime_kr', 'anime,jp', 'anime,kr');
