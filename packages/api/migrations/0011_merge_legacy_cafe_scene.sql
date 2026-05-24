-- Merge legacy local/dev cafe scene into the canonical v1 pier_coffee_shop.
-- Keep the old scene row inactive instead of deleting it, so historical
-- references remain safe if a database has extra local data.

UPDATE messages
SET scene_id = 'pier_coffee_shop'
WHERE scene_id = 'cafe';

UPDATE events
SET scene_id = 'pier_coffee_shop'
WHERE scene_id = 'cafe';

UPDATE scenes
SET is_active = 0
WHERE id = 'cafe';
