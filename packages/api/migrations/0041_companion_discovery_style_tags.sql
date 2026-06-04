-- spec-032: public companion discovery style buckets.
-- User-facing discovery uses style:anime / style:realistic companion tags.
-- Current official seed portraits are illustration/anime-leaning, so backfill
-- active official companions into the Anime bucket without adding a schema field.

UPDATE companions
SET tags = CASE
  WHEN tags IS NULL OR TRIM(tags) = '' THEN '["style:anime"]'
  WHEN tags LIKE '%"style:anime"%' THEN tags
  ELSE substr(TRIM(tags), 1, length(TRIM(tags)) - 1) || ',"style:anime"]'
END
WHERE source = 'official'
  AND is_active = 1;
