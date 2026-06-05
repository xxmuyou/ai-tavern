-- spec-022 2026-06-04: cache RunningHub workflow API contract metadata.
--
-- nodeId/fieldName validation is driven by the workflow API JSON returned by
-- getJsonApiFormat. Keep the compact parsed contract in D1 so Admin saves and
-- generation enqueue can reject mismatched node fields before RunningHub does.

ALTER TABLE image_workflows ADD COLUMN load_image_field_name TEXT NOT NULL DEFAULT 'image';
ALTER TABLE image_workflows ADD COLUMN contract_json TEXT;
ALTER TABLE image_workflows ADD COLUMN contract_hash TEXT;
ALTER TABLE image_workflows ADD COLUMN contract_refreshed_at INTEGER;
