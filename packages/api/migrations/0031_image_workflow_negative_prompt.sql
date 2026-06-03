-- Per-workflow negative prompt node.
--
-- WF2 expression variants run RunningHub img2img. The prompt asks for new
-- arm/hand gestures, and with no negative conditioning the model keeps the
-- source limbs AND adds the new ones — producing extra arms/hands and even
-- duplicate heads ("三头六臂"). Give each workflow an optional negative text
-- node so the provider can inject an anti-deformity negative prompt.
--
-- node_id is nullable: when empty the provider injects nothing and behavior is
-- unchanged. Field name defaults to "prompt" (the Qwen image-edit negative node
-- TextEncodeQwenImageEditPlus uses the same field name as the positive node).

ALTER TABLE image_workflows ADD COLUMN negative_prompt_node_id TEXT;
ALTER TABLE image_workflows ADD COLUMN negative_prompt_field_name TEXT NOT NULL DEFAULT 'prompt';
