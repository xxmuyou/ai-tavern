-- Scene Catalog V2.
--
-- Replaces the original 10 official scenes with the 24-scene catalog defined
-- in docs/product/scene-catalog-v2.md. V1 scenes are kept inactive so
-- historical messages/events keep their references, except iron_forge_gym,
-- whose ID is intentionally reused by the V2 catalog.

UPDATE scenes
SET is_active = 0
WHERE id IN (
  'pier_coffee_shop',
  'sky_office',
  'twin_pines_park',
  'moon_bar',
  'sunrise_apartment',
  'brookside_bookshop',
  'skyline_rooftop',
  'iron_forge_gym',
  'crescent_library',
  'harbor_market'
);

INSERT OR REPLACE INTO scenes
  (id, name, mood, tags, possible_events, default_companions, unlock_condition, art_url, display_order, is_active, created_at)
VALUES
  ('central_station_plaza',
   'Central Station Plaza',
   'A bright station plaza where commuters, travelers, and chance meetings pass through the city without needing a reason to stay.',
   '["transit","city","public","day"]',
   '["daily_encounter","invitation"]',
   '["ryan","jordan"]',
   NULL,
   'scenes/central_station_plaza.png',
   1, 1, unixepoch() * 1000),

  ('pier_cafe',
   'Pier Cafe',
   'A small cafe at the end of the pier, warm enough for a first conversation and quiet enough to notice what someone does not say.',
   '["cafe","waterfront","warm","day"]',
   '["daily_encounter","invitation","gift"]',
   '["maya","theo"]',
   NULL,
   'scenes/pier_cafe.png',
   2, 1, unixepoch() * 1000),

  ('midnight_convenience_store',
   'Midnight Convenience Store',
   'A fluorescent late-night shop where ordinary errands feel strangely honest under rain, vending machines, and quiet streets.',
   '["night","errand","city","neon"]',
   '["daily_encounter","gift","invitation"]',
   '["lila","jordan"]',
   NULL,
   'scenes/midnight_convenience_store.png',
   3, 1, unixepoch() * 1000),

  ('rainlit_bookshop',
   'Rainlit Bookshop',
   'A narrow bookshop with rain on the glass and warm lamps between shelves, built for accidental recommendations and careful silences.',
   '["bookshop","rain","quiet","indoor"]',
   '["daily_encounter","gift","invitation"]',
   '["maya","sora","aiko","theo"]',
   NULL,
   'scenes/rainlit_bookshop.png',
   4, 1, unixepoch() * 1000),

  ('apartment_lobby',
   'Apartment Lobby',
   'The shared lobby of your apartment building, close enough to feel domestic without yet crossing into private life.',
   '["home","neighbor","evening","familiar"]',
   '["daily_encounter","gift","milestone"]',
   '["iris"]',
   '{"type":"min_relationship","companion_id":"iris","dim":"closeness","value":10}',
   'scenes/apartment_lobby.png',
   5, 1, unixepoch() * 1000),

  ('shared_laundry_room',
   'Shared Laundry Room',
   'A small residential laundry room where mundane chores turn into low-stakes honesty.',
   '["home","laundry","quiet","familiar"]',
   '["daily_encounter","gift"]',
   '["iris","ryan"]',
   '{"type":"min_relationship","companion_id":"iris","dim":"trust","value":10}',
   'scenes/shared_laundry_room.png',
   6, 1, unixepoch() * 1000),

  ('neighborhood_park',
   'Neighborhood Park',
   'A small local park where familiar faces become easier to approach after the city slows down.',
   '["park","outdoor","familiar","evening"]',
   '["daily_encounter","invitation","milestone"]',
   '["ethan","iris","ryan"]',
   '{"type":"min_relationship","companion_id":"ethan","dim":"friendship","value":10}',
   'scenes/neighborhood_park.png',
   7, 1, unixepoch() * 1000),

  ('creative_studio',
   'Creative Studio',
   'A shared creative workspace with sketches, models, and late-afternoon light, made for careful ambition and unfinished thoughts.',
   '["studio","work","creative","indoor"]',
   '["daily_encounter","conflict","invitation"]',
   '["maya","ryan","aiko"]',
   '{"type":"min_relationship","companion_id":"maya","dim":"trust","value":10}',
   'scenes/creative_studio.png',
   8, 1, unixepoch() * 1000),

  ('indie_cinema',
   'Indie Cinema',
   'A small independent cinema lobby after the trailers start, quiet enough for a first almost-date to become real.',
   '["cinema","date","night","indoor"]',
   '["daily_encounter","invitation","milestone"]',
   '["theo","maya"]',
   '{"type":"min_relationship","companion_id":"theo","dim":"romance","value":20}',
   'scenes/indie_cinema.png',
   9, 1, unixepoch() * 1000),

  ('dessert_parlor',
   'Dessert Parlor',
   'A bright dessert shop where playful choices can turn into something softer.',
   '["dessert","date","sweet","day"]',
   '["daily_encounter","gift","invitation"]',
   '["maya","iris","theo"]',
   '{"type":"min_relationship","companion_id":"maya","dim":"romance","value":20}',
   'scenes/dessert_parlor.png',
   10, 1, unixepoch() * 1000),

  ('vinyl_record_shop',
   'Vinyl Record Shop',
   'A narrow record shop where taste becomes a flirtation and silence has rhythm.',
   '["music","date","quiet","indoor"]',
   '["daily_encounter","gift","invitation"]',
   '["sora","jordan"]',
   '{"type":"min_relationship","companion_id":"sora","dim":"closeness","value":20}',
   'scenes/vinyl_record_shop.png',
   11, 1, unixepoch() * 1000),

  ('riverside_walk',
   'Riverside Walk',
   'A river path at blue hour where conversation can keep moving when eye contact feels like too much.',
   '["riverside","date","outdoor","evening"]',
   '["daily_encounter","invitation","milestone"]',
   '["ryan","marcus","iris"]',
   '{"type":"min_relationship","companion_id":"ryan","dim":"closeness","value":20}',
   'scenes/riverside_walk.png',
   12, 1, unixepoch() * 1000),

  ('skyline_roof_garden',
   'Skyline Roof Garden',
   'A roof garden above the city where distance makes honesty feel possible.',
   '["rooftop","night","honest","outdoor"]',
   '["confession","milestone","invitation"]',
   '["sora","marcus"]',
   '{"type":"min_relationship","companion_id":"sora","dim":"closeness","value":30}',
   'scenes/skyline_roof_garden.png',
   13, 1, unixepoch() * 1000),

  ('last_bus_stop',
   'Last Bus Stop',
   'A late bus stop under streetlights, built for conversations people only admit when they are almost leaving.',
   '["night","transit","lonely","rain"]',
   '["daily_encounter","confession","invitation"]',
   '["lila","marcus"]',
   '{"type":"min_relationship","companion_id":"lila","dim":"trust","value":25}',
   'scenes/last_bus_stop.png',
   14, 1, unixepoch() * 1000),

  ('crescent_reading_room',
   'Crescent Reading Room',
   'A crescent-shaped reading room where the quiet makes every question sound deliberate.',
   '["library","quiet","study","indoor"]',
   '["daily_encounter","gift","confession"]',
   '["marcus","aiko"]',
   '{"type":"min_relationship","companion_id":"marcus","dim":"trust","value":25}',
   'scenes/crescent_reading_room.png',
   15, 1, unixepoch() * 1000),

  ('rain_arcade',
   'Rain Arcade',
   'A covered shopping arcade after rain, nostalgic and half-empty, where avoidance can finally run out.',
   '["arcade","rain","night","nostalgic"]',
   '["daily_encounter","invitation","confession"]',
   '["jordan","aiko"]',
   '{"type":"min_relationship","companion_id":"jordan","dim":"closeness","value":25}',
   'scenes/rain_arcade.png',
   16, 1, unixepoch() * 1000),

  ('iron_forge_gym',
   'Iron Forge Gym',
   'An old-school gym where effort is plain and encouragement can feel unexpectedly intimate.',
   '["gym","active","indoor","morning"]',
   '["daily_encounter","invitation"]',
   '["ethan"]',
   NULL,
   'scenes/iron_forge_gym.png',
   17, 1, unixepoch() * 1000),

  ('harbor_weekend_market',
   'Harbor Weekend Market',
   'A bright harbor market where energy, food, and half-planned errands make it easy to wander together.',
   '["market","harbor","day","lively"]',
   '["daily_encounter","gift","invitation"]',
   '["jordan","lila","iris"]',
   NULL,
   'scenes/harbor_weekend_market.png',
   18, 1, unixepoch() * 1000),

  ('underground_livehouse',
   'Underground Livehouse',
   'A small basement livehouse after soundcheck, loud even when empty.',
   '["music","night","stage","active"]',
   '["daily_encounter","invitation","confession"]',
   '["sora","lila","jordan"]',
   '{"type":"min_relationship","companion_id":"sora","dim":"closeness","value":20}',
   'scenes/underground_livehouse.png',
   19, 1, unixepoch() * 1000),

  ('neon_game_arcade',
   'Neon Game Arcade',
   'A neon arcade where competitive jokes make room for braver feelings.',
   '["arcade","playful","night","active"]',
   '["daily_encounter","invitation","gift"]',
   '["ethan","jordan","ryan"]',
   '{"type":"min_relationship","companion_id":"jordan","dim":"friendship","value":15}',
   'scenes/neon_game_arcade.png',
   20, 1, unixepoch() * 1000),

  ('midnight_hotel_suite',
   'Midnight Hotel Suite',
   'A quiet hotel suite at midnight where city rain and private space make every pause feel deliberate.',
   '["hotel","bedroom","intimate","night"]',
   '["confession","milestone"]',
   '["lila","sora"]',
   '{"type":"min_relationship","companion_id":"lila","dim":"romance","value":60}',
   'scenes/midnight_hotel_suite.png',
   21, 1, unixepoch() * 1000),

  ('private_apartment_bedroom',
   'Private Apartment Bedroom',
   'A private bedroom that feels lived-in and trusted, more vulnerable than dramatic.',
   '["home","bedroom","intimate","night"]',
   '["confession","milestone","gift"]',
   '["theo","iris","maya"]',
   '{"type":"min_relationship","companion_id":"theo","dim":"romance","value":60}',
   'scenes/private_apartment_bedroom.png',
   22, 1, unixepoch() * 1000),

  ('rainfall_window_lounge',
   'Rainfall Window Lounge',
   'A private window lounge with rain against the glass, built for sitting close and saying less.',
   '["lounge","rain","intimate","night"]',
   '["confession","milestone"]',
   '["sora","marcus","aiko"]',
   '{"type":"min_relationship","companion_id":"sora","dim":"romance","value":45}',
   'scenes/rainfall_window_lounge.png',
   23, 1, unixepoch() * 1000),

  ('dawn_balcony',
   'Dawn Balcony',
   'A dawn balcony after a long night, intimate because the city is waking before anyone is ready to speak.',
   '["balcony","morning","intimate","quiet"]',
   '["confession","milestone"]',
   '["maya","ryan","theo"]',
   '{"type":"min_relationship","companion_id":"maya","dim":"trust","value":50}',
   'scenes/dawn_balcony.png',
   24, 1, unixepoch() * 1000);

UPDATE companions SET preferred_scenes = '["pier_cafe","rainlit_bookshop","creative_studio"]' WHERE id = 'maya' AND source = 'official';
UPDATE companions SET preferred_scenes = '["central_station_plaza","creative_studio","riverside_walk"]' WHERE id = 'ryan' AND source = 'official';
UPDATE companions SET preferred_scenes = '["midnight_convenience_store","underground_livehouse","last_bus_stop"]' WHERE id = 'lila' AND source = 'official';
UPDATE companions SET preferred_scenes = '["iron_forge_gym","neighborhood_park","neon_game_arcade"]' WHERE id = 'ethan' AND source = 'official';
UPDATE companions SET preferred_scenes = '["vinyl_record_shop","skyline_roof_garden","underground_livehouse"]' WHERE id = 'sora' AND source = 'official';
UPDATE companions SET preferred_scenes = '["crescent_reading_room","skyline_roof_garden","last_bus_stop"]' WHERE id = 'marcus' AND source = 'official';
UPDATE companions SET preferred_scenes = '["creative_studio","rainlit_bookshop","crescent_reading_room"]' WHERE id = 'aiko' AND source = 'official';
UPDATE companions SET preferred_scenes = '["harbor_weekend_market","rain_arcade","neon_game_arcade"]' WHERE id = 'jordan' AND source = 'official';
UPDATE companions SET preferred_scenes = '["apartment_lobby","shared_laundry_room","neighborhood_park"]' WHERE id = 'iris' AND source = 'official';
UPDATE companions SET preferred_scenes = '["pier_cafe","rainlit_bookshop","indie_cinema"]' WHERE id = 'theo' AND source = 'official';

UPDATE companion_story_beats SET scene_id = 'pier_cafe' WHERE scene_id = 'cafe';
UPDATE companion_story_beats SET scene_id = 'pier_cafe' WHERE scene_id = 'pier_coffee_shop';
UPDATE companion_story_beats SET scene_id = 'creative_studio' WHERE scene_id = 'sky_office';
UPDATE companion_story_beats SET scene_id = 'neighborhood_park' WHERE scene_id = 'twin_pines_park';
UPDATE companion_story_beats SET scene_id = 'underground_livehouse' WHERE scene_id = 'moon_bar';
UPDATE companion_story_beats SET scene_id = 'apartment_lobby' WHERE scene_id = 'sunrise_apartment';
UPDATE companion_story_beats SET scene_id = 'rainlit_bookshop' WHERE scene_id = 'brookside_bookshop';
UPDATE companion_story_beats SET scene_id = 'skyline_roof_garden' WHERE scene_id = 'skyline_rooftop';
UPDATE companion_story_beats SET scene_id = 'crescent_reading_room' WHERE scene_id = 'crescent_library';
UPDATE companion_story_beats SET scene_id = 'harbor_weekend_market' WHERE scene_id = 'harbor_market';

-- Rewrite every structured historical scene reference to the V2 catalog.
-- Free-form user text, summaries, and prompt snapshots are intentionally left
-- untouched; only scene_id columns and explicit JSON scene_id snapshots move.
UPDATE messages
SET scene_id = CASE scene_id
  WHEN 'cafe' THEN 'pier_cafe'
  WHEN 'pier_coffee_shop' THEN 'pier_cafe'
  WHEN 'sky_office' THEN 'creative_studio'
  WHEN 'twin_pines_park' THEN 'neighborhood_park'
  WHEN 'moon_bar' THEN 'underground_livehouse'
  WHEN 'sunrise_apartment' THEN 'apartment_lobby'
  WHEN 'brookside_bookshop' THEN 'rainlit_bookshop'
  WHEN 'skyline_rooftop' THEN 'skyline_roof_garden'
  WHEN 'crescent_library' THEN 'crescent_reading_room'
  WHEN 'harbor_market' THEN 'harbor_weekend_market'
  ELSE scene_id
END
WHERE scene_id IN (
  'cafe', 'pier_coffee_shop', 'sky_office', 'twin_pines_park', 'moon_bar',
  'sunrise_apartment', 'brookside_bookshop', 'skyline_rooftop',
  'crescent_library', 'harbor_market'
);

UPDATE events
SET scene_id = CASE scene_id
  WHEN 'cafe' THEN 'pier_cafe'
  WHEN 'pier_coffee_shop' THEN 'pier_cafe'
  WHEN 'sky_office' THEN 'creative_studio'
  WHEN 'twin_pines_park' THEN 'neighborhood_park'
  WHEN 'moon_bar' THEN 'underground_livehouse'
  WHEN 'sunrise_apartment' THEN 'apartment_lobby'
  WHEN 'brookside_bookshop' THEN 'rainlit_bookshop'
  WHEN 'skyline_rooftop' THEN 'skyline_roof_garden'
  WHEN 'crescent_library' THEN 'crescent_reading_room'
  WHEN 'harbor_market' THEN 'harbor_weekend_market'
  ELSE scene_id
END
WHERE scene_id IN (
  'cafe', 'pier_coffee_shop', 'sky_office', 'twin_pines_park', 'moon_bar',
  'sunrise_apartment', 'brookside_bookshop', 'skyline_rooftop',
  'crescent_library', 'harbor_market'
);

UPDATE companion_daily_states
SET scene_id = CASE scene_id
  WHEN 'cafe' THEN 'pier_cafe'
  WHEN 'pier_coffee_shop' THEN 'pier_cafe'
  WHEN 'sky_office' THEN 'creative_studio'
  WHEN 'twin_pines_park' THEN 'neighborhood_park'
  WHEN 'moon_bar' THEN 'underground_livehouse'
  WHEN 'sunrise_apartment' THEN 'apartment_lobby'
  WHEN 'brookside_bookshop' THEN 'rainlit_bookshop'
  WHEN 'skyline_rooftop' THEN 'skyline_roof_garden'
  WHEN 'crescent_library' THEN 'crescent_reading_room'
  WHEN 'harbor_market' THEN 'harbor_weekend_market'
  ELSE scene_id
END
WHERE scene_id IN (
  'cafe', 'pier_coffee_shop', 'sky_office', 'twin_pines_park', 'moon_bar',
  'sunrise_apartment', 'brookside_bookshop', 'skyline_rooftop',
  'crescent_library', 'harbor_market'
);

UPDATE activity_contexts
SET scene_id = CASE scene_id
  WHEN 'cafe' THEN 'pier_cafe'
  WHEN 'pier_coffee_shop' THEN 'pier_cafe'
  WHEN 'sky_office' THEN 'creative_studio'
  WHEN 'twin_pines_park' THEN 'neighborhood_park'
  WHEN 'moon_bar' THEN 'underground_livehouse'
  WHEN 'sunrise_apartment' THEN 'apartment_lobby'
  WHEN 'brookside_bookshop' THEN 'rainlit_bookshop'
  WHEN 'skyline_rooftop' THEN 'skyline_roof_garden'
  WHEN 'crescent_library' THEN 'crescent_reading_room'
  WHEN 'harbor_market' THEN 'harbor_weekend_market'
  ELSE scene_id
END
WHERE scene_id IN (
  'cafe', 'pier_coffee_shop', 'sky_office', 'twin_pines_park', 'moon_bar',
  'sunrise_apartment', 'brookside_bookshop', 'skyline_rooftop',
  'crescent_library', 'harbor_market'
);

UPDATE memories
SET scene_id = CASE scene_id
  WHEN 'cafe' THEN 'pier_cafe'
  WHEN 'pier_coffee_shop' THEN 'pier_cafe'
  WHEN 'sky_office' THEN 'creative_studio'
  WHEN 'twin_pines_park' THEN 'neighborhood_park'
  WHEN 'moon_bar' THEN 'underground_livehouse'
  WHEN 'sunrise_apartment' THEN 'apartment_lobby'
  WHEN 'brookside_bookshop' THEN 'rainlit_bookshop'
  WHEN 'skyline_rooftop' THEN 'skyline_roof_garden'
  WHEN 'crescent_library' THEN 'crescent_reading_room'
  WHEN 'harbor_market' THEN 'harbor_weekend_market'
  ELSE scene_id
END
WHERE scene_id IN (
  'cafe', 'pier_coffee_shop', 'sky_office', 'twin_pines_park', 'moon_bar',
  'sunrise_apartment', 'brookside_bookshop', 'skyline_rooftop',
  'crescent_library', 'harbor_market'
);

UPDATE story_moment_images
SET scene_id = CASE scene_id
  WHEN 'cafe' THEN 'pier_cafe'
  WHEN 'pier_coffee_shop' THEN 'pier_cafe'
  WHEN 'sky_office' THEN 'creative_studio'
  WHEN 'twin_pines_park' THEN 'neighborhood_park'
  WHEN 'moon_bar' THEN 'underground_livehouse'
  WHEN 'sunrise_apartment' THEN 'apartment_lobby'
  WHEN 'brookside_bookshop' THEN 'rainlit_bookshop'
  WHEN 'skyline_rooftop' THEN 'skyline_roof_garden'
  WHEN 'crescent_library' THEN 'crescent_reading_room'
  WHEN 'harbor_market' THEN 'harbor_weekend_market'
  ELSE scene_id
END
WHERE scene_id IN (
  'cafe', 'pier_coffee_shop', 'sky_office', 'twin_pines_park', 'moon_bar',
  'sunrise_apartment', 'brookside_bookshop', 'skyline_rooftop',
  'crescent_library', 'harbor_market'
);

UPDATE activity_contexts
SET daily_state_snapshot =
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(daily_state_snapshot,
    '"scene_id":"cafe"', '"scene_id":"pier_cafe"'),
    '"scene_id": "cafe"', '"scene_id": "pier_cafe"'),
    '"scene_id":"pier_coffee_shop"', '"scene_id":"pier_cafe"'),
    '"scene_id": "pier_coffee_shop"', '"scene_id": "pier_cafe"'),
    '"scene_id":"sky_office"', '"scene_id":"creative_studio"'),
    '"scene_id": "sky_office"', '"scene_id": "creative_studio"'),
    '"scene_id":"twin_pines_park"', '"scene_id":"neighborhood_park"'),
    '"scene_id": "twin_pines_park"', '"scene_id": "neighborhood_park"'),
    '"scene_id":"moon_bar"', '"scene_id":"underground_livehouse"'),
    '"scene_id": "moon_bar"', '"scene_id": "underground_livehouse"'),
    '"scene_id":"sunrise_apartment"', '"scene_id":"apartment_lobby"'),
    '"scene_id": "sunrise_apartment"', '"scene_id": "apartment_lobby"'),
    '"scene_id":"brookside_bookshop"', '"scene_id":"rainlit_bookshop"'),
    '"scene_id": "brookside_bookshop"', '"scene_id": "rainlit_bookshop"'),
    '"scene_id":"skyline_rooftop"', '"scene_id":"skyline_roof_garden"'),
    '"scene_id": "skyline_rooftop"', '"scene_id": "skyline_roof_garden"'),
    '"scene_id":"crescent_library"', '"scene_id":"crescent_reading_room"'),
    '"scene_id": "crescent_library"', '"scene_id": "crescent_reading_room"'),
    '"scene_id":"harbor_market"', '"scene_id":"harbor_weekend_market"'),
    '"scene_id": "harbor_market"', '"scene_id": "harbor_weekend_market"')
WHERE daily_state_snapshot IS NOT NULL;
