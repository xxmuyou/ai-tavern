-- Add a beach scene to the official scene catalog.

INSERT OR REPLACE INTO scenes
  (id, name, mood, tags, possible_events, default_companions, unlock_condition, art_url, display_order, is_active, created_at)
VALUES
  ('beach',
   'Beach',
   'A bright shoreline with clear water, warm sand, and an easy vacation mood for lighthearted conversations in the sun.',
   '["beach","shoreline","outdoor","day","vacation"]',
   '["daily_encounter","invitation","gift","milestone"]',
   '["maya","theo","ryan","iris"]',
   NULL,
   'scenes/beach.png',
   26, 1, unixepoch() * 1000);
