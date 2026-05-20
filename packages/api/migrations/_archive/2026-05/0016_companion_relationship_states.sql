-- Migrate legacy relationship_state values to the new three-tier model:
--   regular_friend -> not yet unlocked (default)
--   date_object   -> Chapter 1 (Dating Show) completed; can enter Chapter 2
--   love_object   -> Chapter 2 completed; can enter Chapter 3
--
-- Strategy:
--   * Companions with unlock_status='unlocked' AND legacy relationship_state in (unlocked, warming_up)
--     are mapped to date_object (they've finished Chapter 1).
--   * Any other companion row (including those left over from earlier experiments)
--     is reset to regular_friend so the new gating treats them as not-yet-promoted.

UPDATE user_companions
SET relationship_state = 'date_object',
    updated_at = CURRENT_TIMESTAMP
WHERE unlock_status = 'unlocked'
  AND relationship_state IN ('unlocked', 'warming_up');

UPDATE user_companions
SET relationship_state = 'regular_friend',
    updated_at = CURRENT_TIMESTAMP
WHERE relationship_state NOT IN ('date_object', 'love_object');
