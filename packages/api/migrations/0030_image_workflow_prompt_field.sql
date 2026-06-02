-- Per-workflow prompt field name.
--
-- The prompt nodeInfo field name was hardcoded to "text", which is correct for
-- standard CLIPTextEncode prompt nodes (wf1). But the Qwen image-edit workflows
-- (wf2 expression variants, wf_moment chat scenes) use TextEncodeQwenImageEditPlus,
-- whose prompt field is named "prompt" — feeding "text" made RunningHub reject the
-- task with NODE_INFO_MISMATCH(field_not_found_in_node_inputs). Make the field name
-- a per-workflow property so each workflow injects its node's real field.

ALTER TABLE image_workflows ADD COLUMN prompt_field_name TEXT NOT NULL DEFAULT 'text';

-- Qwen image-edit workflows want "prompt"; everything else keeps "text".
UPDATE image_workflows SET prompt_field_name = 'prompt' WHERE key IN ('wf2', 'wf_moment');
