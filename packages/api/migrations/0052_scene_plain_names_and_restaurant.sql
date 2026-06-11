-- Scene plain names + restaurant.
--
-- Keep stable scene IDs for historical messages, story beats, events, and
-- preferred_scenes references. Only simplify reader-facing names and add one
-- ordinary low-gate restaurant scene.

UPDATE scenes
SET
  name = CASE id
    WHEN 'central_station_plaza' THEN 'Plaza'
    WHEN 'pier_cafe' THEN 'Cafe'
    WHEN 'midnight_convenience_store' THEN 'Convenience Store'
    WHEN 'rainlit_bookshop' THEN 'Bookshop'
    WHEN 'apartment_lobby' THEN 'Apartment Lobby'
    WHEN 'shared_laundry_room' THEN 'Laundry Room'
    WHEN 'neighborhood_park' THEN 'Park'
    WHEN 'creative_studio' THEN 'Studio'
    WHEN 'indie_cinema' THEN 'Cinema'
    WHEN 'dessert_parlor' THEN 'Dessert Shop'
    WHEN 'vinyl_record_shop' THEN 'Record Shop'
    WHEN 'riverside_walk' THEN 'Riverside'
    WHEN 'skyline_roof_garden' THEN 'Roof Garden'
    WHEN 'last_bus_stop' THEN 'Bus Stop'
    WHEN 'crescent_reading_room' THEN 'Library'
    WHEN 'rain_arcade' THEN 'Shopping Arcade'
    WHEN 'iron_forge_gym' THEN 'Gym'
    WHEN 'harbor_weekend_market' THEN 'Market'
    WHEN 'underground_livehouse' THEN 'Livehouse'
    WHEN 'neon_game_arcade' THEN 'Game Arcade'
    WHEN 'midnight_hotel_suite' THEN 'Hotel'
    WHEN 'private_apartment_bedroom' THEN 'Bedroom'
    WHEN 'rainfall_window_lounge' THEN 'Lounge'
    WHEN 'dawn_balcony' THEN 'Balcony'
    ELSE name
  END,
  display_order = CASE id
    WHEN 'central_station_plaza' THEN 1
    WHEN 'pier_cafe' THEN 2
    WHEN 'midnight_convenience_store' THEN 4
    WHEN 'rainlit_bookshop' THEN 5
    WHEN 'apartment_lobby' THEN 6
    WHEN 'shared_laundry_room' THEN 7
    WHEN 'neighborhood_park' THEN 8
    WHEN 'creative_studio' THEN 9
    WHEN 'indie_cinema' THEN 10
    WHEN 'dessert_parlor' THEN 11
    WHEN 'vinyl_record_shop' THEN 12
    WHEN 'riverside_walk' THEN 13
    WHEN 'skyline_roof_garden' THEN 14
    WHEN 'last_bus_stop' THEN 15
    WHEN 'crescent_reading_room' THEN 16
    WHEN 'rain_arcade' THEN 17
    WHEN 'iron_forge_gym' THEN 18
    WHEN 'harbor_weekend_market' THEN 19
    WHEN 'underground_livehouse' THEN 20
    WHEN 'neon_game_arcade' THEN 21
    WHEN 'midnight_hotel_suite' THEN 22
    WHEN 'private_apartment_bedroom' THEN 23
    WHEN 'rainfall_window_lounge' THEN 24
    WHEN 'dawn_balcony' THEN 25
    ELSE display_order
  END
WHERE id IN (
  'central_station_plaza',
  'pier_cafe',
  'midnight_convenience_store',
  'rainlit_bookshop',
  'apartment_lobby',
  'shared_laundry_room',
  'neighborhood_park',
  'creative_studio',
  'indie_cinema',
  'dessert_parlor',
  'vinyl_record_shop',
  'riverside_walk',
  'skyline_roof_garden',
  'last_bus_stop',
  'crescent_reading_room',
  'rain_arcade',
  'iron_forge_gym',
  'harbor_weekend_market',
  'underground_livehouse',
  'neon_game_arcade',
  'midnight_hotel_suite',
  'private_apartment_bedroom',
  'rainfall_window_lounge',
  'dawn_balcony'
);

INSERT OR REPLACE INTO scenes
  (id, name, mood, tags, possible_events, default_companions, unlock_condition, art_url, display_order, is_active, created_at)
VALUES
  ('restaurant',
   'Restaurant',
   'A warm everyday restaurant with quiet tables, gentle evening light, and enough privacy for an easy dinner conversation without feeling secluded.',
   '["restaurant","date","dinner","indoor","evening"]',
   '["daily_encounter","gift","invitation","milestone"]',
   '["maya","theo","ryan","iris"]',
   '{"type":"min_relationship","companion_id":"maya","dim":"closeness","value":10}',
   'scenes/restaurant.png',
   3, 1, unixepoch() * 1000);

UPDATE companions
SET preferred_scenes = '["pier_cafe","restaurant","rainlit_bookshop","creative_studio"]'
WHERE id = 'maya' AND source = 'official';

UPDATE companions
SET preferred_scenes = '["pier_cafe","restaurant","rainlit_bookshop","indie_cinema"]'
WHERE id = 'theo' AND source = 'official';

UPDATE companions
SET preferred_scenes = '["central_station_plaza","restaurant","creative_studio","riverside_walk"]'
WHERE id = 'ryan' AND source = 'official';

UPDATE companions
SET preferred_scenes = '["apartment_lobby","restaurant","shared_laundry_room","neighborhood_park"]'
WHERE id = 'iris' AND source = 'official';
