-- Add daytime travel and outdoor scenes to the official scene catalog.

INSERT OR REPLACE INTO scenes
  (id, name, mood, tags, possible_events, default_companions, unlock_condition, art_url, display_order, is_active, created_at)
VALUES
  ('hot_spring_ryokan',
   'Hot Spring',
   'A peaceful ryokan garden with warm sunlight, gentle steam, and a relaxed travel mood for unhurried conversations.',
   '["hot_spring","ryokan","travel","outdoor","day"]',
   '["daily_encounter","invitation","gift","milestone"]',
   '["maya","theo","iris","sora"]',
   NULL,
   'scenes/hot_spring_ryokan.png',
   27, 1, unixepoch() * 1000),

  ('beach_boardwalk',
   'Boardwalk',
   'A sunny seaside promenade where bright ocean air and easy steps make the day feel open and light.',
   '["boardwalk","beach","travel","outdoor","day"]',
   '["daily_encounter","invitation","gift","milestone"]',
   '["maya","ryan","lila","jordan"]',
   NULL,
   'scenes/beach_boardwalk.png',
   28, 1, unixepoch() * 1000),

  ('mountain_trail',
   'Mountain Trail',
   'A clear mountain path with green shade, distant peaks, and enough quiet for conversations that keep moving.',
   '["mountain","trail","hiking","outdoor","day"]',
   '["daily_encounter","invitation","milestone"]',
   '["ethan","ryan","iris","sora"]',
   NULL,
   'scenes/mountain_trail.png',
   29, 1, unixepoch() * 1000),

  ('theme_park',
   'Theme Park',
   'A cheerful daytime amusement park where playful choices can turn a simple outing into a small adventure.',
   '["theme_park","date","playful","outdoor","day"]',
   '["daily_encounter","invitation","gift","milestone"]',
   '["maya","theo","lila","jordan"]',
   NULL,
   'scenes/theme_park.png',
   30, 1, unixepoch() * 1000),

  ('ski_lodge',
   'Ski Lodge',
   'A bright alpine lodge surrounded by sunlit snow, warm wood, and the calm feeling of a winter trip.',
   '["ski_lodge","snow","travel","outdoor","day"]',
   '["daily_encounter","invitation","gift","milestone"]',
   '["ryan","ethan","sora","iris"]',
   NULL,
   'scenes/ski_lodge.png',
   31, 1, unixepoch() * 1000);
