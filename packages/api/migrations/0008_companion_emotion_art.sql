-- Companion emotion art map (spec-012 stage-1 portrait bar)
--
-- Stores per-companion mapping from ChatEmotion → portrait URL.
-- JSON shape: {"warm":"https://...","neutral":"...","guarded":"...","playful":"...","tense":"...","annoyed":"..."}.
-- Frontend falls back to art_url, then to a generated placeholder, when a key is missing.
ALTER TABLE companions ADD COLUMN art_emotions TEXT;

UPDATE companions
SET art_emotions = '{"neutral":"portraits/maya/neutral.webp","warm":"portraits/maya/warm.webp","playful":"portraits/maya/playful.webp","guarded":"portraits/maya/guarded.webp","tense":"portraits/maya/tense.webp","annoyed":"portraits/maya/annoyed.webp"}'
WHERE id = 'maya';

UPDATE companions
SET art_emotions = '{"neutral":"portraits/ryan/neutral.webp","warm":"portraits/ryan/warm.webp","playful":"portraits/ryan/playful.webp","guarded":"portraits/ryan/guarded.webp","tense":"portraits/ryan/tense.webp","annoyed":"portraits/ryan/annoyed.webp"}'
WHERE id = 'ryan';

UPDATE companions
SET art_emotions = '{"neutral":"portraits/lila/neutral.webp","warm":"portraits/lila/warm.webp","playful":"portraits/lila/playful.webp","guarded":"portraits/lila/guarded.webp","tense":"portraits/lila/tense.webp","annoyed":"portraits/lila/annoyed.webp"}'
WHERE id = 'lila';

UPDATE companions
SET art_emotions = '{"neutral":"portraits/sora/neutral.webp","warm":"portraits/sora/warm.webp","playful":"portraits/sora/playful.webp","guarded":"portraits/sora/guarded.webp","tense":"portraits/sora/tense.webp","annoyed":"portraits/sora/annoyed.webp"}'
WHERE id = 'sora';

UPDATE companions
SET art_emotions = '{"neutral":"portraits/aiko/neutral.webp","warm":"portraits/aiko/warm.webp","playful":"portraits/aiko/playful.webp","guarded":"portraits/aiko/guarded.webp","tense":"portraits/aiko/tense.webp","annoyed":"portraits/aiko/annoyed.webp"}'
WHERE id = 'aiko';
