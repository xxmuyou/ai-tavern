-- Populate delivered v1 art asset paths for existing databases.
-- Missing assets intentionally remain NULL so the app keeps its placeholder UI.

UPDATE scenes SET art_url = 'scenes/pier_coffee_shop.png' WHERE id = 'pier_coffee_shop';
UPDATE scenes SET art_url = 'scenes/sky_office.png' WHERE id = 'sky_office';
UPDATE scenes SET art_url = 'scenes/twin_pines_park.png' WHERE id = 'twin_pines_park';
UPDATE scenes SET art_url = 'scenes/moon_bar.png' WHERE id = 'moon_bar';
UPDATE scenes SET art_url = 'scenes/brookside_bookshop.png' WHERE id = 'brookside_bookshop';
UPDATE scenes SET art_url = 'scenes/skyline_rooftop.png' WHERE id = 'skyline_rooftop';
UPDATE scenes SET art_url = 'scenes/iron_forge_gym.png' WHERE id = 'iron_forge_gym';
UPDATE scenes SET art_url = 'scenes/crescent_library.png' WHERE id = 'crescent_library';
UPDATE scenes SET art_url = 'scenes/harbor_market.png' WHERE id = 'harbor_market';

UPDATE companions
SET
  art_url = 'portraits/maya/neutral.webp',
  art_emotions = '{"neutral":"portraits/maya/neutral.webp","warm":"portraits/maya/warm.webp","playful":"portraits/maya/playful.webp","guarded":"portraits/maya/guarded.webp","tense":"portraits/maya/tense.webp","annoyed":"portraits/maya/annoyed.webp"}'
WHERE id = 'maya';

UPDATE companions
SET
  art_url = 'portraits/ryan/neutral.webp',
  art_emotions = '{"neutral":"portraits/ryan/neutral.webp","warm":"portraits/ryan/warm.webp","playful":"portraits/ryan/playful.webp","guarded":"portraits/ryan/guarded.webp","tense":"portraits/ryan/tense.webp","annoyed":"portraits/ryan/annoyed.webp"}'
WHERE id = 'ryan';

UPDATE companions
SET
  art_url = 'portraits/lila/neutral.webp',
  art_emotions = '{"neutral":"portraits/lila/neutral.webp","warm":"portraits/lila/warm.webp","playful":"portraits/lila/playful.webp","guarded":"portraits/lila/guarded.webp","tense":"portraits/lila/tense.webp","annoyed":"portraits/lila/annoyed.webp"}'
WHERE id = 'lila';

UPDATE companions
SET
  art_url = 'portraits/sora/neutral.webp',
  art_emotions = '{"neutral":"portraits/sora/neutral.webp","warm":"portraits/sora/warm.webp","playful":"portraits/sora/playful.webp","guarded":"portraits/sora/guarded.webp","tense":"portraits/sora/tense.webp","annoyed":"portraits/sora/annoyed.webp"}'
WHERE id = 'sora';

UPDATE companions
SET
  art_url = 'portraits/aiko/neutral.webp',
  art_emotions = '{"neutral":"portraits/aiko/neutral.webp","warm":"portraits/aiko/warm.webp","playful":"portraits/aiko/playful.webp","guarded":"portraits/aiko/guarded.webp","tense":"portraits/aiko/tense.webp","annoyed":"portraits/aiko/annoyed.webp"}'
WHERE id = 'aiko';
