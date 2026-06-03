-- 0035: message variants (regenerate / swipe).
-- A companion reply can now hold several alternative wordings the user can swipe
-- between. We keep them as a JSON array on the message row (rather than extra
-- rows) so created_at ordering, attached signals, and story_moment_images that
-- reference messages.id all stay stable. `content` always mirrors the currently
-- selected variant, so history loading and prompt context need no changes.
-- NULL variants = a single-version message (every message before this migration).
ALTER TABLE messages ADD COLUMN variants TEXT;
ALTER TABLE messages ADD COLUMN selected_variant INTEGER;
