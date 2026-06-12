-- 0056: Manual homepage trending rank for curated official companions.
-- Unlike play_count, trend_rank is editorial ordering and should not pretend
-- to be organic user activity.
ALTER TABLE companions ADD COLUMN trend_rank INTEGER;

CREATE INDEX IF NOT EXISTS idx_companions_trend_rank
  ON companions(trend_rank)
  WHERE trend_rank IS NOT NULL;
