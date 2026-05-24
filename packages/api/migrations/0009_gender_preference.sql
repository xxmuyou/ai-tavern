-- Gender field + romance preference (spec-017)
--
-- - companions.gender: 'male' | 'female'. NULL is allowed only as transient
--   state before the seed UPDATE below; application code treats unknown
--   genders as if the companion were unisex (no weighting effect).
-- - users.romance_preference: 'male' | 'female' | 'any'. Defaults to 'any'
--   so existing accounts see no behavior change until they pick a side.
--   Affects only the weighted spawn pick inside scenes/enter; no other
--   downstream system reads it.

ALTER TABLE companions ADD COLUMN gender TEXT;

ALTER TABLE users
  ADD COLUMN romance_preference TEXT NOT NULL DEFAULT 'any';

-- Backfill the 10 official companions. Sora is reclassified to female as part
-- of this change (see docs/product/content.md §3.5). User-created rows keep
-- gender = NULL until the next save through the API; the app will prompt.
UPDATE companions SET gender = 'female' WHERE id = 'maya';
UPDATE companions SET gender = 'female' WHERE id = 'lila';
UPDATE companions SET gender = 'female' WHERE id = 'sora';
UPDATE companions SET gender = 'female' WHERE id = 'aiko';
UPDATE companions SET gender = 'female' WHERE id = 'iris';
UPDATE companions SET gender = 'male'   WHERE id = 'ryan';
UPDATE companions SET gender = 'male'   WHERE id = 'ethan';
UPDATE companions SET gender = 'male'   WHERE id = 'marcus';
UPDATE companions SET gender = 'male'   WHERE id = 'jordan';
UPDATE companions SET gender = 'male'   WHERE id = 'theo';
