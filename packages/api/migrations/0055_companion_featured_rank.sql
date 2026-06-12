-- 0055: Homepage discovery ranking controls.
-- featured_rank is a small manual ordering field for official homepage picks.
ALTER TABLE companions ADD COLUMN featured_rank INTEGER;

CREATE INDEX IF NOT EXISTS idx_companions_featured_rank
  ON companions(featured_rank)
  WHERE featured_rank IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companion_favorites_companion
  ON companion_favorites(companion_id);

UPDATE companions
SET featured_rank = CASE id
  WHEN 'maya' THEN 1
  WHEN 'ryan' THEN 2
  WHEN 'lila' THEN 3
  WHEN 'ethan' THEN 4
  WHEN 'sora' THEN 5
  WHEN 'marcus' THEN 6
  WHEN 'aiko' THEN 7
  WHEN 'jordan' THEN 8
  WHEN 'iris' THEN 9
  WHEN 'theo' THEN 10
END
WHERE source = 'official'
  AND id IN ('maya','ryan','lila','ethan','sora','marcus','aiko','jordan','iris','theo');
