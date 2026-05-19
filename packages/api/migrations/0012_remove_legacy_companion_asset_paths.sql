UPDATE character_cards
SET
  assets_json = '{"avatarObjectKey":null,"portraitObjectKey":null,"galleryObjectKeys":[]}',
  updated_at = CURRENT_TIMESTAMP
WHERE character_key IN ('mia', 'noah')
  AND assets_json LIKE '%ai-tv-dating%';
